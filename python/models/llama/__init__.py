"""Llama. Meta's LLM series (3.x, 4)."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["llama"]
TASK = "text-generation"
ADAPTER = make_pipeline_adapter("text-generation", name="LlamaAdapter")
