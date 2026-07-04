"""SAM v1. Meta's Segment Anything Model."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["sam"]
TASK = "mask-generation"
ADAPTER = make_pipeline_adapter("mask-generation", name="SamAdapter")
