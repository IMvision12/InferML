"""DPT. Dense Prediction Transformer for depth + segmentation."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["dpt"]
TASK = "depth-estimation"
EXTRA_TASKS = ["image-segmentation"]
ADAPTER = make_pipeline_adapter("depth-estimation", name="DptAdapter")
