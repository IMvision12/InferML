"""Seamless-M4T (v1 + v2). Meta's multilingual speech-and-text translation."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["seamless_m4t", "seamless_m4t_v2"]
TASK = "automatic-speech-recognition"
ADAPTER = make_pipeline_adapter("automatic-speech-recognition", name="SeamlessM4TAdapter")
