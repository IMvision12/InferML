"""In-process pub/sub for server-sent events.

Replaces Electron's `webContents.send(...)` broadcasts. The renderer's bridge
opens one EventSource on `/api/events`; the server pushes named events
(`chats:updated`, `hf:installsChanged`, `hw:update`) to every connected client.
"""
from __future__ import annotations

import asyncio
import json
from typing import Any


class EventHub:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue] = set()

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=256)
        self._subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self._subscribers.discard(q)

    def publish(self, event: str, data: Any = None) -> None:
        """Fan out to all subscribers. Safe to call from the event loop thread.
        Full queues drop the message rather than block (a slow client must not
        stall a hardware-poll broadcast)."""
        payload = {"event": event, "data": data}
        for q in list(self._subscribers):
            try:
                q.put_nowait(payload)
            except asyncio.QueueFull:
                pass

    @staticmethod
    def format_sse(payload: dict) -> str:
        return f"event: {payload['event']}\ndata: {json.dumps(payload.get('data'))}\n\n"


HUB = EventHub()
