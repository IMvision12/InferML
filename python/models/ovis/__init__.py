"""Ovis. AIDC-AI's Ovis 1.x / 2.x VLM family. Needs trust_remote_code."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["ovis"]
TASK = "image-text-to-text"
ADAPTER = make_pipeline_adapter("image-text-to-text", name="OvisAdapter")
