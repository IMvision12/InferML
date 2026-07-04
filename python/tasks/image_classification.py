"""image-classification + zero-shot-image-classification."""
from __future__ import annotations

from .base import TaskHandler, TaskVariant
from io_utils import decode_image
import output_kinds as ok


class StandardClassifyVariant(TaskVariant):
    name = "standard"

    def can_handle(self, info, inputs):
        return bool(inputs.get("dataUrl"))

    def run(self, state, inputs, params):
        img = decode_image(inputs["dataUrl"])
        top_k = int(params.get("top_k", 10))
        results = state.pipe(img) or []
        return ok.labels([{"label": r["label"], "score": float(r["score"])} for r in results[:top_k]])


class ImageClassificationTask(TaskHandler):
    name = "image-classification"
    output_kind = "labels"
    default_params = {"top_k": 10}
    variants = [StandardClassifyVariant()]


class ZeroShotImageClassifyVariant(TaskVariant):
    name = "zero-shot"

    def can_handle(self, info, inputs):
        return bool(inputs.get("dataUrl"))

    def run(self, state, inputs, params):
        img = decode_image(inputs["dataUrl"])
        candidates = params.get("candidate_labels") or [c.strip() for c in (inputs.get("text") or "").split(",") if c.strip()]
        if not candidates:
            raise ValueError("Zero-shot classification needs candidate labels (comma-separated text)")
        results = state.pipe(img, candidate_labels=candidates) or []
        return ok.labels([{"label": r["label"], "score": float(r["score"])} for r in results])


class ZeroShotImageClassificationTask(TaskHandler):
    name = "zero-shot-image-classification"
    output_kind = "labels"
    default_params = {}
    variants = [ZeroShotImageClassifyVariant()]
