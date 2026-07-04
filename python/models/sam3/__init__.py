"""SAM 3 family. Meta's third-generation Segment Anything."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["sam3", "sam3_video", "sam3_lite_text", "sam3_tracker"]
TASK = "mask-generation"
ADAPTER = make_pipeline_adapter("mask-generation", name="Sam3Adapter")
