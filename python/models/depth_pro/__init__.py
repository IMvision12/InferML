"""Depth Pro. Apple's monocular depth estimator."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["depth_pro"]
TASK = "depth-estimation"
ADAPTER = make_pipeline_adapter("depth-estimation", name="DepthProAdapter")
