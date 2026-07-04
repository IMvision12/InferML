"""Inference routes — HTTP equivalents of the old `tasks:*` IPC channels.

  POST /api/run              ← tasks:run
  POST /api/download         ← tasks:download   (SSE progress stream)
  POST /api/download/cancel  ← tasks:cancelDownload
  POST /api/stop             ← tasks:stop
  GET  /api/status           ← tasks:status / tasks:statusSync
  GET  /api/models           list loaded models + current LLM
  POST /api/models/load      lazy-load a model without running
  POST /api/models/unload    free a model (or all)
"""
from __future__ import annotations

import asyncio
import threading
import traceback

from fastapi import APIRouter, Body
from fastapi.responses import StreamingResponse

from engine import DownloadCancelled, actionable_error
from server import deps
from server.events import EventHub

router = APIRouter(prefix="/api")

# modelId -> threading.Event for the in-flight download (cancellation).
_ACTIVE_DOWNLOADS: dict[str, threading.Event] = {}

# The inference stack that makes ALL model families runnable. `ready` requires
# every one of these importable — a bare `pipx install localml` (no [inference]
# extra) has none of them, so the onboarding shows and offers to install them.
_FULL_STACK = [
    "torch", "transformers", "PIL", "numpy", "huggingface_hub",
    "soundfile", "librosa", "accelerate", "timm", "diffusers",
    "sentencepiece", "scipy",
]

# The inference deps installed by /api/setup (torch is handled separately so it
# can come from the accelerator-matched index).
_INFERENCE_PKGS = [
    "transformers>=5.7.0", "diffusers", "accelerate", "timm", "pillow",
    "soundfile", "librosa", "numpy", "scipy", "sentencepiece", "protobuf",
    "huggingface_hub",
]

_setup_running = False


@router.post("/run")
async def run(payload: dict = Body(...)):
    model = payload.get("modelId") or payload.get("model") or "unknown"
    task = payload.get("task")
    deps.clear_stop()
    deps.log("inference", f"{task} · {model}", event="run.start", meta={"task": task, "model": model})
    async with deps.INFERENCE_LOCK:
        try:
            output = await deps.run_blocking(
                deps.engine().run, payload.get("modelId"), task,
                payload.get("input") or {}, payload.get("params") or {},
            )
            deps.log("inference", f"{task} · {model} done", event="run.done", meta={"task": task, "model": model})
            return {"ok": True, "output": output}
        except Exception as e:
            if deps.stop_requested():
                return {"ok": False, "error": "Stopped by user", "cancelled": True}
            msg = actionable_error(e)
            deps.log("inference", f"{task} · {model} failed: {msg}", level="error",
                     event="run.error", meta={"task": task, "model": model})
            print("[run] " + traceback.format_exc())
            return {"ok": False, "error": msg}


@router.post("/download")
async def download(payload: dict = Body(...)):
    model_id = payload.get("modelId")
    if not model_id:
        return {"ok": False, "error": "modelId required"}

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()
    cancel_event = threading.Event()
    _ACTIVE_DOWNLOADS[model_id] = cancel_event

    def on_progress(evt: dict) -> None:
        # Called from the worker thread — hop back to the loop thread.
        loop.call_soon_threadsafe(queue.put_nowait, {"type": "progress", **evt})

    def worker():
        try:
            info = deps.engine().download(model_id, on_progress=on_progress, cancel_event=cancel_event)
            loop.call_soon_threadsafe(queue.put_nowait, {"type": "result", "ok": True, "info": info})
        except DownloadCancelled:
            loop.call_soon_threadsafe(queue.put_nowait, {"type": "result", "ok": False, "cancelled": True, "error": "cancelled"})
        except Exception as e:
            loop.call_soon_threadsafe(queue.put_nowait, {"type": "result", "ok": False, "error": actionable_error(e)})
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, {"type": "__done__"})

    deps.log("download", f"Downloading {model_id}", event="download.start", meta={"modelId": model_id})
    threading.Thread(target=worker, name=f"hf-download-{model_id}", daemon=True).start()

    async def stream():
        try:
            while True:
                msg = await queue.get()
                if msg.get("type") == "__done__":
                    break
                yield EventHub.format_sse({"event": "download", "data": {"modelId": model_id, **msg}})
        finally:
            if _ACTIVE_DOWNLOADS.get(model_id) is cancel_event:
                _ACTIVE_DOWNLOADS.pop(model_id, None)

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/download/cancel")
async def cancel_download(payload: dict = Body(...)):
    model_id = payload.get("modelId")
    ev = _ACTIVE_DOWNLOADS.get(model_id)
    if ev is None:
        return {"ok": True, "cancelled": False, "reason": "no active download"}
    ev.set()
    deps.log("download", f"Cancelled download · {model_id}", level="warn",
             event="download.cancel", meta={"modelId": model_id})
    return {"ok": True, "cancelled": True}


@router.post("/stop")
async def stop():
    deps.request_stop()
    deps.log("inference", "User requested stop", level="warn", event="inference.stop.request")
    return {"ok": True}


@router.get("/models")
async def models():
    eng = deps.engine()
    return {"loaded": eng.loaded_model_ids(), "currentLlm": eng.current_llm_id()}


@router.post("/models/load")
async def load_model(payload: dict = Body(...)):
    model_id = payload.get("modelId")
    task = payload.get("task")
    if not model_id:
        return {"ok": False, "error": "modelId required"}
    async with deps.INFERENCE_LOCK:
        try:
            await deps.run_blocking(deps.engine().ensure_loaded, model_id, task)
            return {"ok": True, "loaded": deps.engine().loaded_model_ids()}
        except Exception as e:
            return {"ok": False, "error": actionable_error(e)}


@router.post("/models/unload")
async def unload_model(payload: dict = Body(default={})):
    model_id = (payload or {}).get("modelId")
    n = deps.engine().unload(model_id)
    return {"ok": True, "unloaded": n}


@router.get("/status")
async def status():
    """Server-is-the-runtime status. Fast (no torch import): readiness via
    find_spec, accelerator via nvidia-smi/platform heuristics."""
    return _probe_status()


def _probe_status() -> dict:
    import importlib.util
    import importlib.metadata
    import os
    import platform
    import shutil
    import sys
    from pathlib import Path

    missing = [m for m in _FULL_STACK if importlib.util.find_spec(m) is None]
    ready = not missing

    is_mac = platform.system() == "Darwin"
    has_nvidia = shutil.which("nvidia-smi") is not None
    suggested = "gpu" if (is_mac or has_nvidia) else "cpu"

    try:
        torch_version = importlib.metadata.version("torch")
    except Exception:
        torch_version = None

    hf_cache = os.environ.get("HF_HOME") or str(Path.home() / ".cache" / "huggingface")

    return {
        # In the pipx model the running server IS the runtime.
        "ready": ready,
        "runtimeInstalled": ready,
        "missing": missing,
        "activeAccelerator": suggested,
        "installedAccelerator": suggested,
        "accelerators": {},
        "hasNvidia": has_nvidia,
        "suggestedAccelerator": suggested,
        "torch": torch_version,
        "platform": platform.system().lower(),
        "arch": platform.machine(),
        "runtimePath": sys.prefix,
        "hfCachePath": hf_cache,
        "sidecarRunning": True,
    }


def _pip_phases(accelerator: str):
    """(step label, pip argv) pairs for installing the inference stack."""
    import platform
    import sys
    torch_pkgs = ["torch>=2.6", "torchvision", "torchaudio>=2.6"]
    pip = [sys.executable, "-m", "pip", "install"]
    if accelerator == "gpu" and platform.system() != "Darwin":
        torch_phase = ("Installing PyTorch (CUDA 12.4)",
                       pip + ["--index-url", "https://download.pytorch.org/whl/cu124", *torch_pkgs])
    else:
        label = "Installing PyTorch (Apple Silicon / MPS)" if platform.system() == "Darwin" else "Installing PyTorch (CPU)"
        torch_phase = (label, pip + torch_pkgs)
    return [
        torch_phase,
        ("Installing transformers, diffusers and supporting libraries", pip + _INFERENCE_PKGS),
    ]


@router.post("/setup")
async def setup(payload: dict = Body(default={})):
    """Install the inference stack for the chosen accelerator (cpu/gpu), pip in
    a subprocess, streaming progress as SSE. Powers the onboarding install
    screen. Emits {kind:'step'|'log'} frames and a terminal {kind:'result'}."""
    accel = (payload or {}).get("accelerator") or "cpu"

    async def stream():
        global _setup_running
        if _setup_running:
            yield _sse({"kind": "result", "ok": False, "error": "A setup is already running."})
            return
        _setup_running = True
        loop = asyncio.get_running_loop()
        q: asyncio.Queue = asyncio.Queue()

        def emit(msg):
            loop.call_soon_threadsafe(q.put_nowait, msg)

        def worker():
            import subprocess
            try:
                for step_label, cmd in _pip_phases(accel):
                    emit({"kind": "step", "text": step_label})
                    proc = subprocess.Popen(
                        cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                        text=True, bufsize=1,
                    )
                    for line in proc.stdout:
                        line = line.rstrip()
                        if line:
                            emit({"kind": "log", "text": line})
                    proc.wait()
                    if proc.returncode != 0:
                        emit({"kind": "result", "ok": False,
                              "error": f"pip exited {proc.returncode} during: {step_label}"})
                        return
                emit({"kind": "step", "text": "Runtime ready"})
                emit({"kind": "result", "ok": True})
            except Exception as e:
                emit({"kind": "result", "ok": False, "error": str(e)})
            finally:
                emit({"kind": "__done__"})

        deps.log("setup", f"Installing inference stack ({accel})", event="setup.start")
        threading.Thread(target=worker, name="pip-setup", daemon=True).start()
        try:
            while True:
                msg = await q.get()
                if msg.get("kind") == "__done__":
                    break
                yield _sse(msg)
        finally:
            _setup_running = False

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


def _sse(obj: dict) -> str:
    import json
    return "data: " + json.dumps(obj) + "\n\n"
