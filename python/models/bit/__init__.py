"""BiT. Big Transfer (Google's pre-trained ResNet-V2 family)."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["bit"]
TASK = "image-classification"
ADAPTER = make_pipeline_adapter("image-classification", name="BitAdapter")
