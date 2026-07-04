"""FastSpeech 2 Conformer."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["fastspeech2_conformer"]
TASK = "text-to-speech"
ADAPTER = make_pipeline_adapter("text-to-speech", name="FastSpeech2Adapter")
