"""PaliGemma (1 + 2). Google's gated VLM."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["paligemma"]
TASK = "image-text-to-text"
ADAPTER = make_pipeline_adapter("image-text-to-text", name="PaliGemmaAdapter")
