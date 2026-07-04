"""Per-family model registry.

Each subfolder under `python/models/` is one model family (DETR, SAM, Janus,
Florence-2, FLUX, ...) and owns:

  - `__init__.py` exporting one of two registration shapes:

    Shape A — model_type-keyed (transformers families with a config.json
    `model_type` tag the registry can dispatch on):
        MODEL_TYPES : list[str]      e.g. ["detr", "rt_detr", "rt_detr_v2"]
        TASK        : str            e.g. "object-detection". optional hint
        ADAPTER     : type[Adapter]  the adapter class

    Shape B — library-keyed (families whose runtime doesn't expose a
    transformers `model_type`. mainly diffusers checkpoints, where
    families are identified by the repo id):
        LIBRARY        : str         e.g. "diffusers"
        REPO_PATTERNS  : list[str]   fnmatch-style patterns matched against
                                     `owner/name` (case-insensitive)
        TASK           : str         optional hint
        ADAPTER        : type[Adapter]  typically a DiffusersAdapter subclass

  - `adapter.py`  the load + run logic. self-contained per family.

Why per-folder isolation:
  - When one family breaks (a transformers update, a quirky checkpoint, a
    custom-code shift), only that one folder fails. the registry catches
    the import error and keeps the rest of the families loaded.
  - Adding a new family is a folder, not a patch to a monolith.

The registry is populated at import time. Failures are recorded in
`LOAD_ERRORS` with the module path and exception, so we can surface them
as structured logs without crashing the sidecar.
"""
from __future__ import annotations

import fnmatch
import importlib
from pathlib import Path

# model_type tag (lowercased) -> {adapter, task, family}
REGISTRY: dict[str, dict] = {}
# folder name -> {adapter, task, model_types | library, patterns?, family}
FAMILIES: dict[str, dict] = {}
# Library-keyed entries. ordered list so we can preserve deterministic
# precedence among overlapping repo patterns. Each entry:
#   {library, patterns: list[str], adapter, task, family}
LIBRARY_REGISTRY: list[dict] = []
# folder name -> Exception. populated when an import fails.
LOAD_ERRORS: dict[str, Exception] = {}


def _register_model_types(family: str, mod, adapter, task) -> None:
    mts = list(getattr(mod, "MODEL_TYPES", []) or [])
    # EXTRA_TASKS lets a family declare additional pipeline_tags its
    # model_types may surface under on HF (e.g. BEiT does both image
    # classification AND segmentation). Used by the JSON generator so the
    # filter accepts those repos. Routing still goes through this folder's
    # adapter, which dispatches by pipeline_tag at run time.
    extras = list(getattr(mod, "EXTRA_TASKS", []) or [])
    FAMILIES[family] = {
        "adapter": adapter,
        "task": task,
        "extra_tasks": extras,
        "model_types": mts,
        "family": family,
    }
    for mt in mts:
        key = str(mt).lower()
        if key in REGISTRY and REGISTRY[key]["family"] != family:
            # First-registered wins. flag the collision in errors so we don't
            # silently override.
            LOAD_ERRORS[family] = ValueError(
                f"model_type {key!r} already claimed by family {REGISTRY[key]['family']!r}"
            )
            continue
        REGISTRY[key] = {
            "adapter": adapter,
            "task": task,
            "family": family,
        }


def _register_library(family: str, mod, adapter, task) -> None:
    library = str(getattr(mod, "LIBRARY", "")).lower()
    patterns = list(getattr(mod, "REPO_PATTERNS", []) or [])
    if not library or not patterns:
        LOAD_ERRORS[family] = ValueError(
            f"models/{family}/__init__.py declares LIBRARY but missing LIBRARY/REPO_PATTERNS"
        )
        return
    FAMILIES[family] = {
        "adapter": adapter,
        "task": task,
        "library": library,
        "patterns": patterns,
        "family": family,
    }
    LIBRARY_REGISTRY.append({
        "library": library,
        "patterns": patterns,
        "adapter": adapter,
        "task": task,
        "family": family,
    })


def _discover() -> None:
    here = Path(__file__).parent
    for sub in sorted(here.iterdir()):
        if not sub.is_dir():
            continue
        if sub.name.startswith("_") or sub.name == "__pycache__":
            continue
        try:
            mod = importlib.import_module(f"models.{sub.name}")
        except Exception as e:
            LOAD_ERRORS[sub.name] = e
            continue
        try:
            adapter = getattr(mod, "ADAPTER", None)
            task = getattr(mod, "TASK", None)
            if adapter is None:
                LOAD_ERRORS[sub.name] = ValueError(
                    f"models/{sub.name}/__init__.py must export ADAPTER"
                )
                continue
            has_mts = bool(list(getattr(mod, "MODEL_TYPES", []) or []))
            has_lib = bool(getattr(mod, "LIBRARY", None))
            if has_mts:
                _register_model_types(sub.name, mod, adapter, task)
            elif has_lib:
                _register_library(sub.name, mod, adapter, task)
            else:
                LOAD_ERRORS[sub.name] = ValueError(
                    f"models/{sub.name}/__init__.py must export either "
                    f"MODEL_TYPES (transformers families) or LIBRARY+REPO_PATTERNS "
                    f"(library-keyed families like diffusion)"
                )
        except Exception as e:
            LOAD_ERRORS[sub.name] = e


_discover()


def adapter_for_model_type(model_type: str) -> type | None:
    if not model_type:
        return None
    entry = REGISTRY.get(str(model_type).lower())
    return entry["adapter"] if entry else None


def family_for_model_type(model_type: str) -> str | None:
    if not model_type:
        return None
    entry = REGISTRY.get(str(model_type).lower())
    return entry["family"] if entry else None


def adapter_for_library(library: str, model_id: str) -> tuple[type, str] | None:
    """Library-keyed dispatch. Returns (adapter_cls, family) or None.

    Iterates LIBRARY_REGISTRY and returns the first family whose patterns
    match `model_id` (case-insensitive fnmatch on the full owner/name).
    """
    if not library or not model_id:
        return None
    lib = library.lower()
    mid = model_id.lower()
    for entry in LIBRARY_REGISTRY:
        if entry["library"] != lib:
            continue
        for pattern in entry["patterns"]:
            if fnmatch.fnmatchcase(mid, pattern.lower()):
                return entry["adapter"], entry["family"]
    return None


__all__ = [
    "REGISTRY",
    "FAMILIES",
    "LIBRARY_REGISTRY",
    "LOAD_ERRORS",
    "adapter_for_model_type",
    "family_for_model_type",
    "adapter_for_library",
]
