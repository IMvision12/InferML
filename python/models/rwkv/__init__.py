"""RWKV. Linear-attention RNN-style language model."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["rwkv"]
TASK = "text-generation"
ADAPTER = make_pipeline_adapter("text-generation", name="RwkvAdapter")
