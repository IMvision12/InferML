"""RT-DETR family. Real-time DETR (v1 + v2)."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["rt_detr", "rt_detr_v2"]
TASK = "object-detection"
ADAPTER = make_pipeline_adapter("object-detection", name="RtDetrAdapter")
