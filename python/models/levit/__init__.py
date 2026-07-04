"""LeViT. Hybrid CNN-transformer for image classification."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["levit"]
TASK = "image-classification"
ADAPTER = make_pipeline_adapter("image-classification", name="LeViTAdapter")
