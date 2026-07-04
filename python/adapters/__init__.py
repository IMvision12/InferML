"""Adapter base classes + shared catch-all adapters.

Per-family inference code lives in `python/models/<family>/`. This package
holds only the cross-cutting pieces:

  - `Adapter`                  the base class every family inherits from
  - `StandardPipelineAdapter`  fallback for repos with no dedicated family
  - `DiffusersAdapter`         library passthrough for diffusers checkpoints

Routing strategy lives in `routing.py` and is:

    1. Named override (via model_overrides.json `"adapter"` field)
    2. Plugin adapters (python/plugins/*.py)
    3. models/<family>/ registry (per-family folders)
    4. DiffusersAdapter (library == "diffusers")
    5. StandardPipelineAdapter (pipeline_tag in its task list)
"""
from __future__ import annotations

from .base import Adapter  # noqa: F401
from .standard_pipeline import StandardPipelineAdapter
from .diffusers_pipeline import DiffusersAdapter


def _named_adapters() -> dict[str, type]:
    """Build the name→class map used by `model_overrides.json "adapter"` pins.

    Includes the cross-cutting fallbacks plus every family folder in
    `python/models/`. Built LAZILY (see `__getattr__` below) so we don't
    capture a partially-loaded `models.FAMILIES` if some caller imports
    `models` before `adapters` and the family-folder-discovery chain
    re-enters this module mid-load.
    """
    out: dict[str, type] = {
        "standard":  StandardPipelineAdapter,
        "diffusers": DiffusersAdapter,
    }
    try:
        from models import FAMILIES
        for fam_name, entry in FAMILIES.items():
            cls = entry.get("adapter")
            if cls is None:
                continue
            # Allow lookup by both folder name (e.g. "deepseek_vl") and class
            # short-name (e.g. "deepseekvl") for back-compat with overrides
            # that already used class-based names.
            out[fam_name] = cls
            short = cls.__name__.replace("Adapter", "").lower()
            out.setdefault(short, cls)
    except Exception:
        pass
    return out


# NAMED_ADAPTERS is constructed on first read via PEP 562 module __getattr__.
# Doing it eagerly at import time captured a partial `models.FAMILIES` whenever
# something imported `models` before `adapters` (the family-folder discovery
# chain re-entered this module mid-load and read FAMILIES at zero entries).
# Lazy access waits until any caller actually reads `adapters.NAMED_ADAPTERS`,
# by which time `models/__init__.py` has finished its _discover() pass.
_NAMED_ADAPTERS_CACHE: "dict[str, type] | None" = None


def __getattr__(name: str):
    global _NAMED_ADAPTERS_CACHE
    if name == "NAMED_ADAPTERS":
        if _NAMED_ADAPTERS_CACHE is None:
            _NAMED_ADAPTERS_CACHE = _named_adapters()
        return _NAMED_ADAPTERS_CACHE
    raise AttributeError(f"module 'adapters' has no attribute {name!r}")


__all__ = [
    "Adapter",
    "StandardPipelineAdapter",
    "DiffusersAdapter",
    "NAMED_ADAPTERS",
]
