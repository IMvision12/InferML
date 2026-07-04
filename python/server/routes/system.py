"""System routes: hardware, logs, app info, and the SSE broadcast stream.

  GET /api/hw       ← hw:get
  GET /api/events   ← replaces Electron webContents broadcasts
                      (hw:update, chats:updated, hf:installsChanged)
  GET /api/logs     ← logs:list
  GET /api/app      ← app:version / app:paths
"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from server import __version__, deps
from server.events import HUB, EventHub
from server import hw_service

router = APIRouter(prefix="/api")


@router.get("/hw")
async def hw():
    return await deps.run_blocking(hw_service.sample_hw)


@router.get("/logs")
async def logs():
    return deps.logs()


@router.get("/app")
async def app_info():
    from server.appdata import data_dir
    return {"name": "localml", "version": __version__, "dataDir": str(data_dir())}


@router.get("/events")
async def events(request: Request):
    """Server-sent events: hardware ticks + store-change notifications. The
    bridge opens one of these and routes by event name."""
    q = HUB.subscribe()

    async def stream():
        try:
            # Prime the connection so EventSource fires `open` immediately.
            yield ": connected\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    payload = await asyncio.wait_for(q.get(), timeout=15.0)
                    yield EventHub.format_sse(payload)
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"  # comment frame, keeps the socket warm
        finally:
            HUB.unsubscribe(q)

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


async def hw_poller(interval: float = 2.5):
    """Single global poller: sample hardware and broadcast `hw:update` to every
    connected client. Started from the app lifespan."""
    while True:
        try:
            data = await deps.run_blocking(hw_service.sample_hw)
            if not data.get("error"):
                HUB.publish("hw:update", data)
        except Exception:
            pass
        await asyncio.sleep(interval)
