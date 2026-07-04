"""SmolVLM (1 + 2). HuggingFace's compact VLM family."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["smolvlm", "smolvlm2"]
TASK = "image-text-to-text"
ADAPTER = make_pipeline_adapter("image-text-to-text", name="SmolVlmAdapter")
