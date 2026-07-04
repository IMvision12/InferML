"""OWL-ViT family. Google's open-vocabulary object detector (v1 + v2)."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["owlvit", "owlv2"]
TASK = "zero-shot-object-detection"
ADAPTER = make_pipeline_adapter("zero-shot-object-detection", name="OwlViTAdapter")
