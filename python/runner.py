#!/usr/bin/env python
"""LocalML inference sidecar — legacy stdin/stdout entry point.

All inference logic now lives in `engine.py` (shared with the web server). This
file is a thin NDJSON shim kept for the `_test_*` harnesses and back-compat:

    request:  {"id": str, "type": "run"|"download"|"ping", ...}
    response: {"id": str, "type": "result"|"error"|"pong", ...}
"""
from __future__ import annotations

import json
import os
import sys
import threading
import traceback
from pathlib import Path

# Ensure this directory is on sys.path so `import engine` works regardless of
# how the script is invoked.
sys.path.insert(0, str(Path(__file__).parent.resolve()))

from engine import ENGINE, DownloadCancelled, actionable_error  # noqa: E402


# Serializes stdout writes so the download worker thread and the main reader
# thread never interleave JSON responses.
_WRITE_LOCK = threading.Lock()

# Per-download cancellation flags, keyed by the download request id.
_CANCEL_EVENTS: dict = {}


def _log(msg: str) -> None:
    print(f"[runner] {msg}", file=sys.stderr, flush=True)


def _write(obj: dict) -> None:
    line = json.dumps(obj, ensure_ascii=False) + "\n"
    with _WRITE_LOCK:
        sys.stdout.write(line)
        sys.stdout.flush()


def _handle_download(req: dict) -> None:
    """Runs on a background thread so the main reader stays responsive and can
    receive a `cancelDownload` message mid-flight."""
    req_id = req.get("id")
    model_id = req.get("modelId")
    cancel_event = threading.Event()
    _CANCEL_EVENTS[req_id] = cancel_event

    def on_progress(evt: dict) -> None:
        _write({"id": req_id, "type": "progress", **evt})

    try:
        out = ENGINE.download(model_id, on_progress=on_progress, cancel_event=cancel_event)
        _write({"id": req_id, "type": "result", "output": out})
    except DownloadCancelled:
        _write({
            "id": req_id,
            "type": "error",
            "error": "cancelled",
            "exc_type": "DownloadCancelled",
        })
    except Exception as e:
        _write({
            "id": req_id,
            "type": "error",
            "error": actionable_error(e),
            "exc_type": type(e).__name__,
            "trace": traceback.format_exc(),
        })
    finally:
        _CANCEL_EVENTS.pop(req_id, None)


def _handle(req: dict) -> None:
    req_id = req.get("id")
    req_type = req.get("type", "run")
    try:
        if req_type == "ping":
            _write({"id": req_id, "type": "pong"})
            return
        if req_type == "run":
            out = ENGINE.run(
                req.get("modelId"),
                req.get("task"),
                req.get("input") or {},
                req.get("params") or {},
            )
            _write({"id": req_id, "type": "result", "output": out})
            return
        if req_type == "download":
            t = threading.Thread(
                target=_handle_download, args=(req,), daemon=True,
                name=f"hf-download-{req_id}",
            )
            t.start()
            return
        if req_type == "cancelDownload":
            target = req.get("targetId")
            ev = _CANCEL_EVENTS.get(target)
            if ev is not None:
                ev.set()
                _write({"id": req_id, "type": "result",
                        "output": {"cancelled": True, "targetId": target}})
            else:
                _write({"id": req_id, "type": "result",
                        "output": {"cancelled": False, "targetId": target, "reason": "not active"}})
            return
        raise ValueError(f"Unknown request type: {req_type}")
    except Exception as e:
        _write({
            "id": req_id,
            "type": "error",
            "error": actionable_error(e),
            "exc_type": type(e).__name__,
            "trace": traceback.format_exc(),
        })


def main() -> None:
    hf_home = os.environ.get("HF_HOME")
    if hf_home:
        _log(f"HF_HOME={hf_home}")
    _log(f"python={sys.version.split()[0]} platform={sys.platform}")
    _log("ready")
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except Exception as e:
            _write({"type": "error", "error": f"bad json: {e}"})
            continue
        _handle(req)


if __name__ == "__main__":
    main()
