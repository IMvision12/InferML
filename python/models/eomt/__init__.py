"""EoMT. Encoder-only Mask Transformer for segmentation."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["eomt"]
TASK = "image-segmentation"
ADAPTER = make_pipeline_adapter("image-segmentation", name="EomtAdapter")
