"""Chameleon. Meta's early-fusion mixed-modal model."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["chameleon"]
TASK = "image-text-to-text"
ADAPTER = make_pipeline_adapter("image-text-to-text", name="ChameleonAdapter")
