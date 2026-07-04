"""SigLIP family. Google's sigmoid-loss CLIP variant (v1 + v2)."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["siglip", "siglip2"]
TASK = "zero-shot-image-classification"
ADAPTER = make_pipeline_adapter("zero-shot-image-classification", name="SigLipAdapter")
