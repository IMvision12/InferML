"""Idefics family. Original IDEFICS, IDEFICS2, IDEFICS3."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["idefics", "idefics2", "idefics3"]
TASK = "image-text-to-text"
ADAPTER = make_pipeline_adapter("image-text-to-text", name="IdeficsAdapter")
