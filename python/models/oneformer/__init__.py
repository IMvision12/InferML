"""OneFormer. Universal segmentation with semantic / instance / panoptic mode picker.

Mode is selected via `params.oneformer_mode` (default `semantic`). The shared
task handler in `tasks/image_segmentation.py` reads that param and switches
the post-processor accordingly.
"""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["oneformer"]
TASK = "image-segmentation"
ADAPTER = make_pipeline_adapter("image-segmentation", name="OneFormerAdapter")
