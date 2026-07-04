"""Grounding-DINO. Open-vocabulary DETR with text grounding."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["grounding-dino", "grounding_dino"]
TASK = "zero-shot-object-detection"
ADAPTER = make_pipeline_adapter("zero-shot-object-detection", name="GroundingDinoAdapter")
