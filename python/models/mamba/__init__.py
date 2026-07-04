"""Mamba state-space LMs (v1 + v2)."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["mamba", "mamba2"]
TASK = "text-generation"
ADAPTER = make_pipeline_adapter("text-generation", name="MambaAdapter")
