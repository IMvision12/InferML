"""LFM2-VL. Liquid AI's tiny 450M VLM."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["lfm2_vl"]
TASK = "image-text-to-text"
ADAPTER = make_pipeline_adapter("image-text-to-text", name="Lfm2VlAdapter")
