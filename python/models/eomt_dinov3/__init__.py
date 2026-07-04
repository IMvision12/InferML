"""EoMT with DINOv3 backbone. Encoder-only Mask Transformer + DINOv3.

Separate model_type from the original `eomt` (which lives in `models/eomt/`).
This folder covers `tue-mps/eomt_dinov3_*` checkpoints. Standard
image-segmentation pipeline path.
"""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["eomt_dinov3"]
TASK = "image-segmentation"
ADAPTER = make_pipeline_adapter("image-segmentation", name="EomtDinov3Adapter")
