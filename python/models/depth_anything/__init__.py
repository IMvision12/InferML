"""Depth Anything (v1 + v2)."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["depth_anything", "prompt_depth_anything"]
TASK = "depth-estimation"
ADAPTER = make_pipeline_adapter("depth-estimation", name="DepthAnythingAdapter")
