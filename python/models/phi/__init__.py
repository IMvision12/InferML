"""Phi family. Microsoft's small LLMs. Phi, Phi3, Phi4, Phi-MoE."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["phi", "phi3", "phi4", "phimoe", "phi4_multimodal"]
TASK = "text-generation"
ADAPTER = make_pipeline_adapter("text-generation", name="PhiAdapter")
