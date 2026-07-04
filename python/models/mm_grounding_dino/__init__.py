"""MM-Grounding-DINO. Multimodal Grounding-DINO. open-vocabulary detection.

Successor to Grounding-DINO with a stronger multimodal pretraining recipe.
Same workspace as OWL-ViT / Grounding-DINO / OmDet-Turbo: pass comma-separated
text prompts as candidate labels. Canonical model_type uses hyphens; both
spellings registered.
"""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["mm-grounding-dino", "mm_grounding_dino"]
TASK = "zero-shot-object-detection"
ADAPTER = make_pipeline_adapter("zero-shot-object-detection", name="MmGroundingDinoAdapter")
