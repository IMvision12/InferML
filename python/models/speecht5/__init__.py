"""SpeechT5. TTS with curated x-vector voice picker."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["speecht5"]
TASK = "text-to-speech"
ADAPTER = make_pipeline_adapter("text-to-speech", name="SpeechT5Adapter")
