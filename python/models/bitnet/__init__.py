"""BitNet. 1.58-bit quantized LM. Microsoft Research."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["bitnet"]
TASK = "text-generation"
ADAPTER = make_pipeline_adapter("text-generation", name="BitNetAdapter")
