"""MiniCPM-V. OpenBMB's compact VLM."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["minicpm_v", "minicpm-v"]
TASK = "image-text-to-text"
ADAPTER = make_pipeline_adapter("image-text-to-text", name="MiniCpmVAdapter")
