"""Aria. rhymes-ai's 25B MoE multimodal model."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["aria"]
TASK = "image-text-to-text"
ADAPTER = make_pipeline_adapter("image-text-to-text", name="AriaAdapter")
