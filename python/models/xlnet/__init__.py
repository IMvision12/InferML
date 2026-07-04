"""XLNet. Classic permuted-context autoregressive LM."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["xlnet"]
TASK = "text-generation"
ADAPTER = make_pipeline_adapter("text-generation", name="XLNetAdapter")
