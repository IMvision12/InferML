"""Zamba. Zyphra's hybrid Mamba transformer (v1 + v2)."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["zamba", "zamba2"]
TASK = "text-generation"
ADAPTER = make_pipeline_adapter("text-generation", name="ZambaAdapter")
