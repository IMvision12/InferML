"""NVIDIA Nemotron. Nemotron + Nemotron-H (mamba/attention hybrid)."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["nemotron", "nemotron_h"]
TASK = "text-generation"
ADAPTER = make_pipeline_adapter("text-generation", name="NemotronAdapter")
