"""EXAONE. LG AI Research's bilingual LM."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["exaone"]
TASK = "text-generation"
ADAPTER = make_pipeline_adapter("text-generation", name="ExaoneAdapter")
