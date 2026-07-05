"""Chats + settings routes - HTTP equivalents of `chats:*` / `settings:*` IPC."""
from __future__ import annotations

from fastapi import APIRouter, Body

from server import store_service as store

router = APIRouter(prefix="/api")

@router.get("/chats")
async def list_chats():
    return store.list_chats()

@router.get("/chats/{chat_id}")
async def get_chat(chat_id: str):
    return store.get_chat(chat_id)

@router.post("/chats")
async def save_chat(chat: dict = Body(...)):
    try:
        return {"ok": store.save_chat(chat)}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@router.patch("/chats/{chat_id}")
async def patch_chat(chat_id: str, patch: dict = Body(...)):
    try:
        return {"ok": store.patch_chat(chat_id, patch)}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@router.delete("/chats/{chat_id}")
async def delete_chat(chat_id: str):
    return {"ok": store.delete_chat(chat_id)}

@router.get("/settings")
async def get_settings():
    return store.get_settings()

@router.post("/settings")
async def save_settings(patch: dict = Body(...)):
    return store.save_settings(patch)
