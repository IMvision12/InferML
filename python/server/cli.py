"""Internal entry point - started by the Electron shell, not by users.

`src/main/sidecar.js` picks a free port and runs:

    python -m server.cli --port <port>

The bind address is deliberately NOT configurable. This process serves the app's
UI, its inference endpoints, and the OpenAI-compatible API with no authentication
of any kind, on the assumption that the only thing talking to it is the desktop
window on the same machine. Binding anything other than loopback would expose all
of that to the network, so the option simply doesn't exist.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

_PY_DIR = Path(__file__).resolve().parents[1]
if str(_PY_DIR) not in sys.path:
    sys.path.insert(0, str(_PY_DIR))

HOST = "127.0.0.1"
DEFAULT_PORT = 11500


def _parse_args(argv):
    p = argparse.ArgumentParser(
        prog="server.cli",
        description="InferML model server (started by the desktop app).",
    )
    p.add_argument("--port", type=int, default=DEFAULT_PORT,
                   help=f"Loopback port to serve on (default {DEFAULT_PORT}).")
    p.add_argument("--reload", action="store_true",
                   help="Auto-reload on source changes (development).")
    return p.parse_args(argv)


def _force_utf8_console() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


def main(argv=None) -> None:
    _force_utf8_console()
    args = _parse_args(argv)

    import uvicorn

    print(f"[server] listening on http://{HOST}:{args.port}", flush=True)

    if args.reload:
        uvicorn.run("server.app:app", host=HOST, port=args.port, reload=True)
    else:
        from server.app import app
        uvicorn.run(app, host=HOST, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
