"""Cohere LLM family. Cohere + Cohere2 (Command R / Command R+)."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["cohere", "cohere2"]
TASK = "text-generation"
ADAPTER = make_pipeline_adapter("text-generation", name="CohereAdapter")
