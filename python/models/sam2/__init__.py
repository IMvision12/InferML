"""SAM 2 / 2.1. Hiera-backbone Segment Anything (image + video)."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["sam2", "sam2_video"]
TASK = "mask-generation"
ADAPTER = make_pipeline_adapter("mask-generation", name="Sam2Adapter")
