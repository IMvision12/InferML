"""Mask2Former. Universal segmentation transformer."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["mask2former"]
TASK = "image-segmentation"
ADAPTER = make_pipeline_adapter("image-segmentation", name="Mask2FormerAdapter")
