"""Cohere2-Vision. Cohere's vision-language model."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["cohere2_vision"]
TASK = "image-text-to-text"
ADAPTER = make_pipeline_adapter("image-text-to-text", name="Cohere2VisionAdapter")
