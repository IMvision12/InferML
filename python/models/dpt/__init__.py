"""DPT. Dense Prediction Transformer for depth + segmentation."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["dpt"]
TASK = "depth-estimation"
# Some DPT checkpoints have segmentation heads (ADE20k); runtime adapter
# dispatches by pipeline_tag.
EXTRA_TASKS = ["image-segmentation"]
ADAPTER = make_pipeline_adapter("depth-estimation", name="DptAdapter")
