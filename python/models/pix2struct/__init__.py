"""Pix2Struct. Google's screenshot-to-structured-text model."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["pix2struct"]
TASK = "image-to-text"
ADAPTER = make_pipeline_adapter("image-to-text", name="Pix2StructAdapter")
