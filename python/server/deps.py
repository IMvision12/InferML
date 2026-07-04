"""Shared server state: the inference engine, a serialization lock, a stop
flag, and an in-memory log ring.

The engine is single-threaded against itself (torch), so all blocking inference
runs in a threadpool behind one asyncio.Lock — preserving the old sidecar's
one-request-at-a-time semantics while keeping the event loop responsive for
progress streaming and health checks.
"""
from __future__ import annotations

import asyncio
import threading
import time
from collections import deque

from engine import ENGINE  # the process-wide singleton

# One inference at a time. Guards run() + model load + download.
INFERENCE_LOCK = asyncio.Lock()

# Cooperative stop flag for the streaming/OpenAI generation path. A non-stream
# run() can't be interrupted mid-`generate()` in-process, but streaming checks
# this between tokens.
_STOP_EVENT = threading.Event()


def request_stop() -> None:
    _STOP_EVENT.set()


def clear_stop() -> None:
    _STOP_EVENT.clear()


def stop_requested() -> bool:
    return _STOP_EVENT.is_set()


def engine():
    return ENGINE


# ---------- in-memory log ring (replaces services/logs.js) ----------

_LOGS: deque = deque(maxlen=2000)


def log(source: str, message: str, level: str = "info", event: str = "", meta: dict | None = None) -> dict:
    entry = {
        "ts": int(time.time() * 1000),
        "source": source,
        "level": level,
        "event": event,
        "message": message,
        "meta": meta or {},
    }
    _LOGS.append(entry)
    return entry


def logs(limit: int = 500) -> list[dict]:
    items = list(_LOGS)
    return items[-limit:]


async def run_blocking(fn, *args, **kwargs):
    """Run a blocking engine call in the default threadpool."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, lambda: fn(*args, **kwargs))
