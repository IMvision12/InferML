"""Deformable DETR. Sparse spatial sampling for faster convergence."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["deformable_detr"]
TASK = "object-detection"
ADAPTER = make_pipeline_adapter("object-detection", name="DeformableDetrAdapter")
