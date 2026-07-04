"""IBM Granite. Granite + Granite-MoE."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["granite", "granitemoe"]
TASK = "text-generation"
ADAPTER = make_pipeline_adapter("text-generation", name="GraniteAdapter")
