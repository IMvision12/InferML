"""object-detection - variants: standard-pipeline, zero-shot."""
from __future__ import annotations

from .base import TaskHandler, TaskVariant, LoadedPipeline
from ._render import draw_boxes, encode_png_data_url
from io_utils import decode_image
import output_kinds as ok

ACCENT_DETECT = (100, 220, 180)

def _nms(pruned, iou):
    import torch
    from torchvision.ops import batched_nms
    if not pruned:
        return pruned
    label_index: dict = {}

    def lid(name):
        if name not in label_index:
            label_index[name] = len(label_index)
        return label_index[name]

    b = torch.tensor([[p[0], p[1], p[2], p[3]] for p in pruned], dtype=torch.float32)
    s = torch.tensor([p[4] for p in pruned], dtype=torch.float32)
    l = torch.tensor([lid(p[5]) for p in pruned], dtype=torch.int64)
    keep = batched_nms(b, s, l, iou_threshold=iou).tolist()
    return [pruned[i] for i in keep]

def _normalize_boxes(W, H, pruned):
    return [{
        "label": label,
        "score": score,
        "box": [x1 / W, y1 / H, (x2 - x1) / W, (y2 - y1) / H],
    } for (x1, y1, x2, y2, score, label) in pruned]

class StandardDetectionVariant(TaskVariant):
    """DETR, YOLOS, RT-DETR, ConditionalDETR, etc. Standard pipeline + NMS."""
    name = "standard-detection"

    def can_handle(self, info, inputs):
        return bool(inputs.get("dataUrl"))

    def run(self, state, inputs, params):
        img = decode_image(inputs["dataUrl"])
        W, H = img.size
        threshold = float(params.get("threshold", 0.5))
        iou = float(params.get("nms_iou", 0.45))
        raw = state.pipe(img, threshold=threshold) or []

        pruned = []
        for r in raw:
            score = r.get("score", 0)
            if score < threshold:
                continue
            b = r["box"]
            x1, y1, x2, y2 = b["xmin"], b["ymin"], b["xmax"], b["ymax"]
            if (x2 - x1) <= 0 or (y2 - y1) <= 0:
                continue
            pruned.append((x1, y1, x2, y2, float(score), r["label"]))
        pruned = _nms(pruned, iou)
        boxes = _normalize_boxes(W, H, pruned)

        annotated = draw_boxes(img, boxes, accent=ACCENT_DETECT)
        result = ok.boxes(boxes)
        result["annotated"] = encode_png_data_url(annotated)
        return result

class ObjectDetectionTask(TaskHandler):
    name = "object-detection"
    output_kind = "boxes"
    default_params = {"threshold": 0.5, "nms_iou": 0.45}
    variants = [StandardDetectionVariant()]

class ZeroShotDetectionVariant(TaskVariant):
    """OWL-ViT, OWLv2, Grounding-DINO - takes candidate_labels (text prompts)."""
    name = "zero-shot-detection"

    def can_handle(self, info, inputs):
        return bool(inputs.get("dataUrl"))

    def run(self, state, inputs, params):
        img = decode_image(inputs["dataUrl"])
        W, H = img.size
        threshold = float(params.get("threshold", 0.1))
        iou = float(params.get("nms_iou", 0.45))
        candidates = params.get("candidate_labels") or [c.strip() for c in (inputs.get("text") or "").split(",") if c.strip()]
        if not candidates:
            raise ValueError("Zero-shot detection needs comma-separated candidate labels in the text input")

        raw = state.pipe(img, candidate_labels=candidates, threshold=threshold) or []
        pruned = []
        for r in raw:
            score = r.get("score", 0)
            if score < threshold:
                continue
            b = r["box"]
            x1, y1, x2, y2 = b["xmin"], b["ymin"], b["xmax"], b["ymax"]
            if (x2 - x1) <= 0 or (y2 - y1) <= 0:
                continue
            pruned.append((x1, y1, x2, y2, float(score), r["label"]))
        pruned = _nms(pruned, iou)
        boxes = _normalize_boxes(W, H, pruned)
        annotated = draw_boxes(img, boxes, accent=ACCENT_DETECT)
        result = ok.boxes(boxes)
        result["annotated"] = encode_png_data_url(annotated)
        return result

class ZeroShotObjectDetectionTask(TaskHandler):
    name = "zero-shot-object-detection"
    output_kind = "boxes"
    default_params = {"threshold": 0.1, "nms_iou": 0.45}
    variants = [ZeroShotDetectionVariant()]
