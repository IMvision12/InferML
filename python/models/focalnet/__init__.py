"""FocalNet. Focal modulation networks."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["focalnet"]
TASK = "image-classification"
ADAPTER = make_pipeline_adapter("image-classification", name="FocalNetAdapter")
