"""SegFormer. Hierarchical transformer encoder + lightweight MLP decoder.

Used both for image-classification (with -imagenet1k heads) and
image-segmentation (with -ade / -cityscapes / -coco heads). Routing dispatches
on `pipeline_tag` from the repo metadata.
"""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["segformer"]
TASK = "image-segmentation"
# SegFormer also ships imagenet1k classifier heads. Runtime adapter dispatches
# by pipeline_tag so both surface and load correctly.
EXTRA_TASKS = ["image-classification"]
ADAPTER = make_pipeline_adapter("image-segmentation", name="SegFormerAdapter")
