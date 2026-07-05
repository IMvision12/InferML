"""BLIP family (1 + 2). Image captioning, VQA, and image-text matching.

BLIP also surfaces under `zero-shot-image-classification` (image-text
matching head) but the model_type tag is the same - routing dispatches by
the repo's `pipeline_tag` once we hand off to the standard task handler.
"""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["blip", "blip-2", "blip_2", "instructblip"]
TASK = "image-to-text"
EXTRA_TASKS = ["zero-shot-image-classification"]
ADAPTER = make_pipeline_adapter("image-to-text", name="BlipAdapter")
