"""Gemma3 multimodal (4b / 12b / 27b vision-enabled variants)."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["gemma3", "gemma4"]
TASK = "image-text-to-text"
ADAPTER = make_pipeline_adapter("image-text-to-text", name="Gemma3VlmAdapter")
