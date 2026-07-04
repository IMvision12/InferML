"""CSM. Sesame's Conversational Speech Model.

Registered in transformers as `csm` → `CsmForConditionalGeneration` (in the
text-to-waveform auto-class). Smallest checkpoint: `sesame/csm-1b`.
Tags include both `text-to-audio` and `text-to-speech`; we route via TTS.
"""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["csm"]
TASK = "text-to-speech"
ADAPTER = make_pipeline_adapter("text-to-speech", name="CsmAdapter")
