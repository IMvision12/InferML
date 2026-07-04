"""VITS. End-to-end TTS (Facebook MMS-TTS family)."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["vits"]
TASK = "text-to-speech"
ADAPTER = make_pipeline_adapter("text-to-speech", name="VitsAdapter")
