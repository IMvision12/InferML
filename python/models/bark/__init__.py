"""Bark. Suno's transformer TTS with non-speech generation."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["bark"]
TASK = "text-to-speech"
ADAPTER = make_pipeline_adapter("text-to-speech", name="BarkAdapter")
