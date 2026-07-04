"""OmDet-Turbo. Real-time open-vocabulary object detector.

Pass comma-separated text prompts as candidate labels (same workspace as
OWLv2 / Grounding-DINO). Smallest checkpoint: `omlab/omdet-turbo-swin-tiny-hf`.
Canonical model_type uses a hyphen; both spellings registered.
"""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["omdet-turbo", "omdet_turbo"]
TASK = "zero-shot-object-detection"
ADAPTER = make_pipeline_adapter("zero-shot-object-detection", name="OmDetTurboAdapter")
