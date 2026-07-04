"""CLIP family. OpenAI's contrastive image-text model + variants."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["clip", "chinese_clip", "altclip", "metaclip_2"]
TASK = "zero-shot-image-classification"
ADAPTER = make_pipeline_adapter("zero-shot-image-classification", name="ClipAdapter")
