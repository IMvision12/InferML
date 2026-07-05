#!/usr/bin/env python
"""Regenerate `python/supported_architectures.json` from the `models/` registry.

The JSON is the source of truth for the renderer's Hub filter (in
`src/main/services/huggingface.js`). The registry's `MODEL_TYPES` per family
is the source of truth for the loader. They have to stay in sync; this script
makes the JSON a derived artifact so they can't drift.

Run this:
  - manually whenever you add or rename a family folder
  - automatically as part of `npm run dev` and `npm run dist:*` (see package.json)

Usage:
  python python/_generate_supported_architectures.py [--check]

  --check  exits non-zero if the on-disk JSON differs from what would be
           generated. Use this in CI / pre-commit to fail loudly on drift.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import OrderedDict
from pathlib import Path

PY_DIR = Path(__file__).parent
sys.path.insert(0, str(PY_DIR))

from models import FAMILIES  # noqa: E402

JSON_PATH = PY_DIR / "supported_architectures.json"

TASK_ORDER = [
    "object-detection",
    "zero-shot-object-detection",
    "image-segmentation",
    "mask-generation",
    "image-classification",
    "zero-shot-image-classification",
    "image-to-text",
    "depth-estimation",
    "document-question-answering",
    "image-text-to-text",
    "text-generation",
    "translation",
    "summarization",
    "automatic-speech-recognition",
    "text-to-speech",
]

DOC = (
    "Single source of truth for Model Hub filtering. Each key is an HF "
    "pipeline_tag; each value is the list of model_type tags (transformers-canonical "
    "identifiers like `segformer`, `sam`, `detr`, `qwen3`) that our sidecar can load. "
    "AUTO-GENERATED from python/models/<family>/MODEL_TYPES. Run "
    "`python python/_generate_supported_architectures.py` to regenerate. The "
    "renderer (huggingface.js) reads this file; the loader reads the registry "
    "directly. Edit the family folder, not this file."
)

LIBRARY_PASSTHROUGH_DOC = (
    "These library_name values bypass the model_type check. diffusers uses "
    "model_index.json so it doesn't set a transformers-recognised model_type tag. "
    "timm models load through transformers' TimmWrapperImageClassification but "
    "ship with library_name='timm' on the Hub. We accept them on library_name "
    "alone, and the python side dispatches via the standard image-classification "
    "pipeline."
)

def build() -> "OrderedDict[str, object]":
    """Walk FAMILIES and emit the same shape as the hand-written JSON."""
    by_task: dict[str, list[str]] = {}
    for family_name, entry in FAMILIES.items():
        if "model_types" not in entry:
            continue
        task = entry.get("task")
        if not task:
            continue
        tasks_for_this_family = [task] + list(entry.get("extra_tasks", []) or [])
        for t in tasks_for_this_family:
            bucket = by_task.setdefault(t, [])
            for mt in entry["model_types"]:
                key = str(mt).lower()
                if key not in bucket:
                    bucket.append(key)

    ordered = OrderedDict()
    ordered["_doc"] = DOC
    seen = set()
    for task in TASK_ORDER:
        if task in by_task:
            ordered[task] = sorted(by_task[task])
            seen.add(task)
    for task in sorted(by_task.keys()):
        if task in seen:
            continue
        ordered[task] = sorted(by_task[task])

    ordered["_library_passthrough"] = OrderedDict([
        ("_doc", LIBRARY_PASSTHROUGH_DOC),
        ("libraries", ["diffusers", "timm"]),
    ])
    return ordered

def render(payload) -> str:
    return json.dumps(payload, indent=2) + "\n"

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check", action="store_true",
        help="Exit non-zero if the on-disk JSON differs from generated.",
    )
    args = parser.parse_args()

    payload = build()
    new_text = render(payload)

    if args.check:
        try:
            old_text = JSON_PATH.read_text(encoding="utf-8")
        except FileNotFoundError:
            old_text = ""
        if old_text != new_text:
            print(
                f"DRIFT: {JSON_PATH.name} is out of sync with python/models/.\n"
                f"Run: python {Path(__file__).name}",
                file=sys.stderr,
            )
            return 1
        print(f"{JSON_PATH.name} in sync ({sum(1 for k, v in payload.items() if not k.startswith('_') and isinstance(v, list))} tasks)")
        return 0

    JSON_PATH.write_text(new_text, encoding="utf-8")
    task_count = sum(1 for k, v in payload.items() if not k.startswith("_") and isinstance(v, list))
    type_count = sum(len(v) for k, v in payload.items() if not k.startswith("_") and isinstance(v, list))
    print(f"Wrote {JSON_PATH.name}: {task_count} tasks, {type_count} model_types")
    return 0

if __name__ == "__main__":
    sys.exit(main())
