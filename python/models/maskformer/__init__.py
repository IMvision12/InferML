"""MaskFormer. Per-pixel mask classification, predecessor of Mask2Former."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["maskformer"]
TASK = "image-segmentation"
ADAPTER = make_pipeline_adapter("image-segmentation", name="MaskFormerAdapter")
