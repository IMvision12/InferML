"""EfficientNet."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["efficientnet"]
TASK = "image-classification"
ADAPTER = make_pipeline_adapter("image-classification", name="EfficientNetAdapter")
