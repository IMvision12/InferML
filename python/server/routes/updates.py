"""Update routes: check PyPI for a newer InferML, and self-upgrade + restart.

  GET  /api/updates/check    <- updates.check   (compare __version__ vs PyPI)
  POST /api/updates/install  <- updates.install (pipx upgrade inferml + relaunch)

The install path cannot upgrade the venv it is running from in place - the live
process locks those files (Windows especially) - so it spawns a *detached*
helper that waits for this process to exit, runs `pipx upgrade inferml`, then
relaunches `inferml`. The server binds 127.0.0.1, so these endpoints are
localhost-only (not remotely reachable).
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.request
from pathlib import Path

from fastapi import APIRouter, Query

from server import __version__, deps

router = APIRouter(prefix="/api/updates")

PACKAGE = "inferml"
PYPI_JSON = f"https://pypi.org/pypi/{PACKAGE}/json"
PROJECT_URL = f"https://pypi.org/project/{PACKAGE}/"
_CHECK_TTL = 3600.0
_cache: dict = {"ts": 0.0, "data": None}

def _newer(latest: str, current: str) -> bool:
    """True if `latest` is a strictly greater version than `current`."""
    try:
        from packaging.version import Version  # ships transitively via huggingface_hub
        return Version(latest) > Version(current)
    except Exception:
        def parse(v):
            out = []
            for part in str(v).split("."):
                digits = ""
                for ch in part:
                    if ch.isdigit():
                        digits += ch
                    else:
                        break
                out.append(int(digits) if digits else 0)
            return out
        return parse(latest) > parse(current)

def _pipx_path() -> str | None:
    """Locate the pipx that manages this install. It is on PATH because the user
    installed via pipx (ensurepath). The venv python (sys.executable) does not
    have pipx, so we don't fall back to it."""
    return shutil.which("pipx")

def _fetch_latest() -> str:
    req = urllib.request.Request(PYPI_JSON, headers={"User-Agent": f"{PACKAGE}-updater"})
    with urllib.request.urlopen(req, timeout=8) as r:
        return str(json.load(r)["info"]["version"])

def _check(force: bool = False) -> dict:
    now = time.time()
    if not force and _cache["data"] and (now - _cache["ts"]) < _CHECK_TTL:
        return _cache["data"]
    try:
        latest = _fetch_latest()
    except Exception as e:
        return {"ok": False, "error": f"Could not reach PyPI: {e}",
                "currentVersion": __version__}
    out = {
        "ok": True,
        "hasUpdate": _newer(latest, __version__),
        "currentVersion": __version__,
        "latestVersion": latest,
        "canAutoUpdate": _pipx_path() is not None,
        "releaseUrl": PROJECT_URL,
        "downloadPageUrl": PROJECT_URL,
    }
    _cache["data"] = out
    _cache["ts"] = now
    return out

@router.get("/check")
async def check(force: bool = Query(default=False)):
    return await deps.run_blocking(_check, force)

# --- self-update helper -----------------------------------------------------
# A detached script: wait for the server to exit (unlock venv files), retry the
# pipx upgrade a few times against transient locks, then relaunch inferml in the
# same window with --no-browser (the open tab reconnects and reloads itself).
_WIN_HELPER = """@echo off
title InferML updater
ping -n 5 127.0.0.1 >nul
set _n=0
:retry
{pipx} upgrade {package}
if %errorlevel%==0 goto run
set /a _n+=1
if %_n% geq 5 goto run
ping -n 3 127.0.0.1 >nul
goto retry
:run
{relaunch} --no-browser
"""

_NIX_HELPER = """#!/bin/sh
sleep 3
n=0
while [ $n -lt 5 ]; do
  {pipx} upgrade {package} && break
  n=$((n+1)); sleep 2
done
exec {relaunch} --no-browser
"""

def _q(s: str) -> str:
    return '"' + str(s).replace('"', "") + '"'

def _relaunch_cmd() -> str:
    exe = shutil.which(PACKAGE)
    return _q(exe) if exe else PACKAGE

def _spawn_updater(pipx: str) -> None:
    d = Path(tempfile.mkdtemp(prefix="inferml-update-"))
    fmt = dict(pipx=_q(pipx), package=PACKAGE, relaunch=_relaunch_cmd())
    if os.name == "nt":
        script = d / "update.cmd"
        script.write_text(_WIN_HELPER.format(**fmt), encoding="utf-8")
        CREATE_NEW_CONSOLE = 0x00000010
        subprocess.Popen(["cmd", "/c", str(script)],
                         creationflags=CREATE_NEW_CONSOLE, close_fds=True, cwd=str(d))
    else:
        script = d / "update.sh"
        script.write_text(_NIX_HELPER.format(**fmt), encoding="utf-8")
        os.chmod(script, 0o755)
        subprocess.Popen(["/bin/sh", str(script)], start_new_session=True, close_fds=True,
                         cwd=str(d), stdin=subprocess.DEVNULL,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def _schedule_exit(delay: float = 1.0) -> None:
    def _die():
        time.sleep(delay)
        os._exit(0)  # hard-exit so the venv files unlock for the upgrade
    threading.Thread(target=_die, daemon=True).start()

@router.post("/install")
async def install():
    info = await deps.run_blocking(_check, True)
    if not info.get("ok"):
        return {"ok": False, "error": info.get("error", "version check failed")}
    if not info.get("hasUpdate"):
        return {"ok": False, "error": "Already up to date."}
    pipx = _pipx_path()
    if not pipx:
        return {"ok": False,
                "error": "pipx was not found on PATH. Update manually: pipx upgrade inferml"}
    try:
        _spawn_updater(pipx)
    except Exception as e:
        return {"ok": False, "error": f"Could not start the updater: {e}"}
    _schedule_exit(1.0)
    return {"ok": True, "latestVersion": info.get("latestVersion")}
