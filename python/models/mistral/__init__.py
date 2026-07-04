"""Mistral family. Mistral, Mixtral, Mistral 3, Ministral 3."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["mistral", "mistral3", "ministral3", "mixtral"]
TASK = "text-generation"
ADAPTER = make_pipeline_adapter("text-generation", name="MistralAdapter")
