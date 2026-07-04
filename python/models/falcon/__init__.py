"""Falcon family. Falcon, Falcon-Mamba, Falcon-H1 (hybrid)."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["falcon", "falcon_mamba", "falcon_h1"]
TASK = "text-generation"
ADAPTER = make_pipeline_adapter("text-generation", name="FalconAdapter")
