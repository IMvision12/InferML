"""MLlama. Llama-3.2-Vision (gated)."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["mllama"]
TASK = "image-text-to-text"
ADAPTER = make_pipeline_adapter("image-text-to-text", name="MLlamaAdapter")
