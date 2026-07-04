"""Jamba. AI21 Labs' SSM-transformer hybrid."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["jamba"]
TASK = "text-generation"
ADAPTER = make_pipeline_adapter("text-generation", name="JambaAdapter")
