"""DBRX. Databricks' MoE language model."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["dbrx"]
TASK = "text-generation"
ADAPTER = make_pipeline_adapter("text-generation", name="DbrxAdapter")
