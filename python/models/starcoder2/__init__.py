"""StarCoder2. BigCode's code-specialized LM."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["starcoder2"]
TASK = "text-generation"
ADAPTER = make_pipeline_adapter("text-generation", name="Starcoder2Adapter")
