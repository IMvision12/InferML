"""Kimi-VL. Moonshot AI's vision-language family. Includes Kimi-K25."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["kimi_k25", "kimi_vl"]
TASK = "image-text-to-text"
ADAPTER = make_pipeline_adapter("image-text-to-text", name="KimiVlAdapter")
