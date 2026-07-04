"""OPT. Meta's Open Pre-trained Transformer."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["opt"]
TASK = "text-generation"
ADAPTER = make_pipeline_adapter("text-generation", name="OptAdapter")
