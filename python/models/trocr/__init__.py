"""TrOCR. Transformer-based OCR (printed + handwritten line recognition)."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["trocr"]
TASK = "image-to-text"
ADAPTER = make_pipeline_adapter("image-to-text", name="TrOcrAdapter")
