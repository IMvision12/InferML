"""Whisper. OpenAI's ASR + speech translation.

The renderer's task workspace exposes a 2-button mode picker
(transcribe / translate). The selected mode arrives as `params.whisper_mode`
and is passed to the pipeline by the shared ASR task handler.
"""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["whisper"]
TASK = "automatic-speech-recognition"
ADAPTER = make_pipeline_adapter("automatic-speech-recognition", name="WhisperAdapter")
