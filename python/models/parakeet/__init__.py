"""Parakeet. NVIDIA's fast English ASR."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["parakeet", "parakeet_ctc"]
TASK = "automatic-speech-recognition"
ADAPTER = make_pipeline_adapter("automatic-speech-recognition", name="ParakeetAdapter")
