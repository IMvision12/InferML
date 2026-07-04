"""BLOOM. BigScience's multilingual LM."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["bloom"]
TASK = "text-generation"
ADAPTER = make_pipeline_adapter("text-generation", name="BloomAdapter")
