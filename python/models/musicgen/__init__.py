"""MusicGen + MusicGen Melody. Music generation from text."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["musicgen", "musicgen_melody"]
TASK = "text-to-speech"
ADAPTER = make_pipeline_adapter("text-to-speech", name="MusicGenAdapter")
