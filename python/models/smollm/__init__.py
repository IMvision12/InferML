"""SmolLM3. HuggingFace's 3B small chat."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["smollm3"]
TASK = "text-generation"
ADAPTER = make_pipeline_adapter("text-generation", name="SmolLMAdapter")
