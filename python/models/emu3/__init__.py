"""Emu3. BAAI's unified gen + understanding model. Needs trust_remote_code."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["emu3"]
TASK = "image-text-to-text"
ADAPTER = make_pipeline_adapter("image-text-to-text", name="Emu3Adapter")
