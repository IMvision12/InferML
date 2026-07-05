"""Vision Transformer family. ViT, DeiT, BEiT all share this folder.

These three architectures use the same image-classification pipeline path.
DeiT is a distilled ViT, BEiT is BERT-pretrained ViT. The classifier head
shape is identical across them.
"""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["vit", "vit_hybrid", "deit", "beit"]
TASK = "image-classification"
EXTRA_TASKS = ["image-segmentation"]
ADAPTER = make_pipeline_adapter("image-classification", name="VitAdapter")
