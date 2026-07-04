"""MobileNet family. v1, v2, MobileViT, MobileViTv2."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["mobilenet_v1", "mobilenet_v2", "mobilevit", "mobilevitv2"]
TASK = "image-classification"
# DeepLabv3 ships with mobilenet_v2 / mobilevit / mobilevitv2 backbones for
# semantic segmentation. Runtime dispatches by pipeline_tag.
EXTRA_TASKS = ["image-segmentation"]
ADAPTER = make_pipeline_adapter("image-classification", name="MobileNetAdapter")
