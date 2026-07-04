"""Conditional DETR. DETR variant with conditional cross-attention."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["conditional_detr"]
TASK = "object-detection"
ADAPTER = make_pipeline_adapter("object-detection", name="ConditionalDetrAdapter")
