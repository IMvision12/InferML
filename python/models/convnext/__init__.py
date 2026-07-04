"""ConvNeXt family (v1 + v2)."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["convnext", "convnextv2"]
TASK = "image-classification"
ADAPTER = make_pipeline_adapter("image-classification", name="ConvNeXtAdapter")
