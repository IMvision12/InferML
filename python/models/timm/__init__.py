"""timm wrapper. Generic timm-backed image classifier (transformers >= 4.40).

Catches `timm_wrapper` and `timm_backbone` model_types. Most timm repos
declare `library_name: timm` and load via library passthrough; this entry
covers the case where a repo claims `library_name: transformers` but uses
a timm-derived class.
"""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["timm_wrapper", "timm_backbone"]
TASK = "image-classification"
ADAPTER = make_pipeline_adapter("image-classification", name="TimmAdapter")
