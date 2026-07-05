"""MobileNet family. v1, v2, MobileViT, MobileViTv2."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["mobilenet_v1", "mobilenet_v2", "mobilevit", "mobilevitv2"]
TASK = "image-classification"
EXTRA_TASKS = ["image-segmentation"]
ADAPTER = make_pipeline_adapter("image-classification", name="MobileNetAdapter")
