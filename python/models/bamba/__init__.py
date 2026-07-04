"""Bamba. IBM/Mistral/Princeton hybrid Mamba transformer."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["bamba"]
TASK = "text-generation"
ADAPTER = make_pipeline_adapter("text-generation", name="BambaAdapter")
