"""Marian. Helsinki-NLP/opus-mt translation models. ~1000 language pairs."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["marian"]
TASK = "translation"
ADAPTER = make_pipeline_adapter("translation", name="MarianAdapter")
