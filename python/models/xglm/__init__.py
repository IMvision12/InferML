"""XGLM. Multilingual GPT from Meta."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["xglm"]
TASK = "text-generation"
ADAPTER = make_pipeline_adapter("text-generation", name="XglmAdapter")
