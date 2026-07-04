"""ZoeDepth. Metric depth estimation."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["zoedepth", "glpn"]
TASK = "depth-estimation"
ADAPTER = make_pipeline_adapter("depth-estimation", name="ZoeDepthAdapter")
