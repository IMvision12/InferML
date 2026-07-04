"""Persimmon. Adept's pre-Fuyu LM."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["persimmon"]
TASK = "text-generation"
ADAPTER = make_pipeline_adapter("text-generation", name="PersimmonAdapter")
