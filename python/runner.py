#!/usr/bin/env python
"""LocalML inference sidecar — entry point.

Reads newline-delimited JSON commands from stdin, writes newline-delimited
JSON responses to stdout. All heavy lifting lives in the adapter layer.

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

# Ensure this directory is on sys.path so `import adapters`, `import routing`
# work regardless of how the script is invoked.
sys.path.insert(0, str(Path(__file__).parent.resolve()))

# Apply Windows compatibility patches BEFORE any library that might call
# os.symlink (HuggingFace cache, etc.). No-op on POSIX.
import _win_compat  # noqa: F401, E402

from routing import inspect_model, pick_adapter, override_for  # noqa: E402
from io_utils import resolve_device  # noqa: E402


# Adapter instances keyed by (adapter_class_name, model_id). One model = one
# loaded pipeline; second request reuses it.
_ADAPTER_CACHE = {}

# Serializes stdout writes so the download worker thread and the main reader
# thread never interleave JSON responses.
_WRITE_LOCK = threading.Lock()

# Per-download cancellation flags. Keyed by the download request id so a
# `cancelDownload` message referencing that id can flip the matching flag;
# the download thread's custom tqdm checks the flag and raises, which unwinds
# huggingface_hub cleanly.
_CANCEL_EVENTS: dict = {}


class _DownloadCancelled(Exception):
    """Raised from the custom tqdm when the user dismisses a download."""


def _log(msg: str) -> None:
    print(f"[runner] {msg}", file=sys.stderr, flush=True)


def _write(obj: dict) -> None:
    line = json.dumps(obj, ensure_ascii=False) + "\n"
    with _WRITE_LOCK:
        sys.stdout.write(line)
        sys.stdout.flush()


def _get_adapter(info: dict):
    model_id = info["model_id"]
    ovr = override_for(model_id)
    adapter = pick_adapter(info)
    cache_key = (type(adapter).__name__, model_id)
    cached = _ADAPTER_CACHE.get(cache_key)
    if cached is not None:
        return cached
    _log(f"loading {type(adapter).__name__} for {model_id}")
    dev = resolve_device()
    adapter.load(info, dev)
    _ADAPTER_CACHE[cache_key] = adapter
    return adapter


def _run(req: dict) -> dict:
    model_id = req.get("modelId")
    if not model_id:
        raise ValueError("Missing 'modelId' in payload — the session isn't bound to a model")

    inputs = req.get("input") or {}

    # Apply model_overrides.json params as defaults; request params win on conflict.
    # This honors the documented override schema (trust_remote_code + params).
    override = override_for(model_id) or {}
    ovr_params = override.get("params") or {}
    req_params = req.get("params") or {}
    params = {**ovr_params, **req_params}

    # Include task from the request as a hint so inspect_model can fall back
    # to it if the HF API is unavailable.
    info = inspect_model(model_id)
    if not info.get("pipeline_tag") and req.get("task"):
        info["pipeline_tag"] = req["task"]

    adapter = _get_adapter(info)
    return adapter.run(inputs, params)


def _download(req: dict, cancel_event: threading.Event | None = None) -> dict:
    """Run `snapshot_download` and stream byte-level progress back to the
    sidecar as `type: progress` messages with the same request id. The final
    `type: result` message completes the request.

    If `cancel_event` is set during the download, the custom tqdm raises
    `_DownloadCancelled`. huggingface_hub propagates the exception, worker
    threads clean up, and `_handle_download` reports the cancellation."""
    import re
    import time
    from huggingface_hub import snapshot_download, HfApi
    from tqdm.auto import tqdm as _BaseTqdm

    req_id = req.get("id")
    model_id = req.get("modelId")
    if not model_id:
        raise ValueError("Missing 'modelId' in payload")

    # Many repos ship the same weights in multiple formats (whisper-small has
    # safetensors + bin + flax msgpack + tf h5 + onnx/ + an `openai-format` .pt
    # — together ~5 GB for a 967 MB model). Pick exactly one format, drop the
    # rest. Order must match huggingface.js `WEIGHT_FORMAT_ORDER`.
    WEIGHT_FORMAT_ORDER = ["safetensors", "bin", "pt", "ckpt", "msgpack", "h5", "onnx", "ot"]
    WEIGHT_EXT_RX = re.compile(r"\.(safetensors|bin|pt|ckpt|msgpack|h5|onnx|ot)$", re.IGNORECASE)

    siblings = []
    try:
        info = HfApi().model_info(model_id, files_metadata=True)
        siblings = list(info.siblings or [])
    except Exception:
        siblings = []

    chosen_ext = None
    by_ext: dict = {}
    for s in siblings:
        m = WEIGHT_EXT_RX.search((getattr(s, "rfilename", "") or "").lower())
        if not m:
            continue
        by_ext.setdefault(m.group(1), []).append(s)
    for ext in WEIGHT_FORMAT_ORDER:
        if by_ext.get(ext):
            chosen_ext = ext
            break

    ignore_patterns: list = []
    if chosen_ext:
        for ext in WEIGHT_FORMAT_ORDER:
            if ext != chosen_ext and by_ext.get(ext):
                ignore_patterns.append(f"*.{ext}")
        # ONNX subdirectories also carry per-component models that we never
        # load via transformers — drop them when a primary format is chosen.
        if chosen_ext != "onnx":
            ignore_patterns.append("onnx/*")

    # Compute total bytes from the surviving file set so the percentage tracks
    # what we actually fetch, not the full repo footprint.
    total_bytes = 0
    if siblings:
        for s in siblings:
            name = (getattr(s, "rfilename", "") or "").lower()
            if any(_match_pattern(name, p) for p in ignore_patterns):
                continue
            sz = getattr(s, "size", None) or 0
            if sz:
                total_bytes += sz

    state = {"done": 0, "last_emit": 0.0}
    emit_lock = threading.Lock()

    def emit(final: bool = False) -> None:
        with emit_lock:
            done = state["done"]
            pct = (done / total_bytes * 100.0) if total_bytes else 0.0
            _write({
                "id": req_id,
                "type": "progress",
                "done": int(done),
                "total": int(total_bytes),
                "pct": round(pct, 2),
                "final": bool(final),
            })

    class ProgressTqdm(_BaseTqdm):
        # Suppress the stderr progress bars — they're noisy in dev logs and
        # we surface the same data via structured progress messages.
        #
        # Important: tqdm's __init__ short-circuits when disable=True and
        # never assigns `self.unit`, so we capture it ourselves BEFORE calling
        # super — otherwise `self.unit == 'B'` is always false and nothing
        # accumulates.
        def __init__(self, *args, **kwargs):
            self._is_bytes = kwargs.get("unit") == "B"
            kwargs["disable"] = True
            super().__init__(*args, **kwargs)

        def update(self, n=1):
            # Fast path out when the user has dismissed — raising here unwinds
            # huggingface_hub's worker thread. The outer _handle_download
            # catches `_DownloadCancelled` and reports it as a cancel.
            if cancel_event is not None and cancel_event.is_set():
                raise _DownloadCancelled()
            super().update(n)
            # Only byte-based tqdms contribute — the outer "Fetching N files"
            # bar is file-counting and would skew the numerator.
            if self._is_bytes and n:
                should_emit = False
                with emit_lock:
                    state["done"] += n
                    now = time.time()
                    if (now - state["last_emit"]) >= 0.15:
                        state["last_emit"] = now
                        should_emit = True
                if should_emit:
                    emit()

    # Initial 0% so the UI flips to the progress view immediately instead of
    # waiting for the first chunk to arrive.
    emit()
    try:
        kwargs: dict = {"repo_id": model_id, "tqdm_class": ProgressTqdm}
        if ignore_patterns:
            kwargs["ignore_patterns"] = ignore_patterns
        path = snapshot_download(**kwargs)
    finally:
        emit(final=True)
    return {"path": path, "bytes": state["done"], "total_bytes": total_bytes}


def _match_pattern(name: str, pattern: str) -> bool:
    """Cheap fnmatch-style match for `*.ext` and `prefix/*` only — enough for
    the ignore_patterns we generate here."""
    import fnmatch
    return fnmatch.fnmatch(name, pattern)


def _handle_download(req: dict) -> None:
    """Runs on a background thread so the main reader stays responsive and
    can receive a `cancelDownload` message mid-flight."""
    req_id = req.get("id")
    cancel_event = threading.Event()
    _CANCEL_EVENTS[req_id] = cancel_event
    try:
        out = _download(req, cancel_event)
        _write({"id": req_id, "type": "result", "output": out})
    except _DownloadCancelled:
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
            "error": _actionable_error(e),
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
            out = _run(req)
            _write({"id": req_id, "type": "result", "output": out})
            return
        if req_type == "download":
            # Daemonize so interpreter exit doesn't wait on an in-flight HF call.
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
                _write({
                    "id": req_id, "type": "result",
                    "output": {"cancelled": True, "targetId": target},
                })
            else:
                _write({
                    "id": req_id, "type": "result",
                    "output": {"cancelled": False, "targetId": target, "reason": "not active"},
                })
            return
        raise ValueError(f"Unknown request type: {req_type}")
    except Exception as e:
        _write({
            "id": req_id,
            "type": "error",
            "error": _actionable_error(e),
            "exc_type": type(e).__name__,
            "trace": traceback.format_exc(),
        })


def _actionable_error(e: Exception) -> str:
    """Translate raw tracebacks into messages a user can act on."""
    msg = str(e)
    lower = msg.lower()
    if "out of memory" in lower or "cuda out of memory" in lower:
        return "Out of memory — try a smaller model or switch to CPU (disable CUDA) in settings."
    if "cve-2025-32434" in lower or ("torch" in lower and "v2.6" in msg):
        return ("Your torch version is too old — transformers requires torch ≥ 2.6 to load this model's weights. "
                "Open the Python runtime panel (Welcome → Get started) and Retry setup to upgrade torch.")
    if "not a valid" in lower and "trust_remote_code" in lower:
        return ("This model requires `trust_remote_code=True`. Add an entry for it in "
                f"python/model_overrides.json: {{ \"trust_remote_code\": true }}.")
    is_gated = (
        "gatedrepoerror" in lower
        or "gated repo" in lower
        or "access to model" in lower and "restricted" in lower
        or "401" in msg and ("huggingface" in lower or "unauthorized" in lower)
        or "403" in msg and ("huggingface" in lower or "forbidden" in lower)
        or "must be authenticated" in lower
        or "you need to be logged in" in lower
    )
    if is_gated:
        return ("This model is gated or private — it requires a Hugging Face access token. "
                "Open Settings → HF Token, paste a token from "
                "https://huggingface.co/settings/tokens (Read access is enough), then retry.")
    if "no module named" in lower:
        mod = msg.split("'")[1] if "'" in msg else "unknown"
        return f"Missing Python package: `{mod}`. Click the python chip in the titlebar → Retry to install new deps."
    # transformers feature extractors raise their own "requires the X library"
    # message when an optional audio/vision dependency is missing. catch that
    # so the user gets the same actionable suggestion as for ImportError.
    import re
    m = re.search(r"requires the (\S+) library", msg)
    if m:
        mod = m.group(1).strip("`'\".,")
        return f"Missing Python package: `{mod}`. Click the python chip in the titlebar → Retry to install new deps."
    if "could not load model" in lower or "not a recognized model" in lower:
        return (f"{msg}\n\nThis model doesn't fit any registered family. Add a folder "
                "under python/models/ for it, pin it in python/model_overrides.json, "
                "or drop a plugin file in python/plugins/.")
    return msg


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
