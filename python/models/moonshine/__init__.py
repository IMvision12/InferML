"""Moonshine. Useful Sensors' real-time English ASR."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["moonshine"]
TASK = "automatic-speech-recognition"
ADAPTER = make_pipeline_adapter("automatic-speech-recognition", name="MoonshineAdapter")
