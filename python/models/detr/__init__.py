"""DETR family. Facebook's End-to-End Object Detection with Transformers."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["detr"]
TASK = "object-detection"
# Panoptic-fine-tuned DETR checkpoints surface under image-segmentation.
EXTRA_TASKS = ["image-segmentation"]
ADAPTER = make_pipeline_adapter("object-detection", name="DetrAdapter")
