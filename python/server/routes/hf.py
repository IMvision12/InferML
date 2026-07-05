"""Hugging Face routes - HTTP equivalents of the old `hf:*` IPC channels."""
from __future__ import annotations

from fastapi import APIRouter, Body, Query

from server import deps
from server import hf_service as hf
from server import store_service as store

router = APIRouter(prefix="/api/hf")

@router.get("/search")
async def search(q: str | None = Query(default=None), task: str | None = Query(default=None)):
    try:
        return await deps.run_blocking(hf.search, q, task)
    except Exception as e:
        return {"error": str(e)}

@router.get("/installed")
async def installed():
    return store.list_installed()

@router.post("/markInstalled")
async def mark_installed(payload: dict = Body(...)):
    mid = payload.get("id")
    if not hf.is_valid_model_id(mid):
        return {"ok": False, "error": "Invalid model id"}
    return {"ok": store.mark_installed(mid, payload.get("meta"))}

@router.post("/uninstall")
async def uninstall(payload: dict = Body(...)):
    mid = payload.get("id")
    if not hf.is_valid_model_id(mid):
        return {"ok": False, "error": "Invalid model id"}
    try:
        deps.engine().unload(mid)
    except Exception:
        pass
    store.uninstall(mid)
    cache = await deps.run_blocking(hf.delete_model_cache, mid)
    return {"ok": True, "removed": cache.get("removed", []), "errors": cache.get("errors", [])}

@router.get("/modelInfo")
async def model_info(id: str = Query(...)):
    return await deps.run_blocking(hf.model_info, id)

@router.get("/token")
async def get_token():
    return {"token": hf.get_masked_token()}

@router.get("/hasToken")
async def has_token():
    return {"hasToken": bool(hf.get_token())}

@router.post("/token")
async def set_token(payload: dict = Body(...)):
    return hf.set_token(payload.get("token") or "")

@router.delete("/token")
async def clear_token():
    return hf.clear_token()

@router.post("/verifyToken")
async def verify_token(payload: dict = Body(...)):
    return await deps.run_blocking(hf.verify_token, payload.get("token") or "")
