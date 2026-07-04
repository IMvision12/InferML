"""CvT. Convolutional vision Transformer."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["cvt"]
TASK = "image-classification"
ADAPTER = make_pipeline_adapter("image-classification", name="CvTAdapter")
