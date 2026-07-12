"""InferML local model server.

A FastAPI + uvicorn app that serves the compiled React UI and exposes the
inference backend over HTTP, including an OpenAI-compatible API.

It runs as a child process of the Electron desktop shell (`src/main/`), which
starts it on a loopback port and points its window at it. Nothing here depends
on Electron, though: the server is a standalone web app, which is what keeps the
headless/dev path (`python -m server.cli`) working.

The inference engine is imported in-process (see `python/engine.py`) so native
GPU/MPS access is preserved and the OpenAI endpoint can hold a live handle to
the currently-loaded LLM.
"""
from __future__ import annotations

# Kept in lockstep with package.json, which is the version the desktop app and
# its auto-updater actually ship under.
__version__ = "2.0.0"
