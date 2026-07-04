"""Hunyuan-VL. Tencent's video / multimodal Hunyuan."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["hunyuan_vl_mot"]
TASK = "image-text-to-text"
ADAPTER = make_pipeline_adapter("image-text-to-text", name="HunyuanVlAdapter")
