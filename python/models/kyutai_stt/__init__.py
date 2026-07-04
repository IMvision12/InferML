"""Kyutai STT. Real-time speech-to-text from Kyutai Labs.

Registered in transformers as a SpeechSeq2Seq model (same auto-class family
as Whisper), so the standard `pipeline("automatic-speech-recognition")` path
loads it without quirks. Smallest checkpoint: `kyutai/stt-1b-en_fr`.
"""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["kyutai_speech_to_text"]
TASK = "automatic-speech-recognition"
ADAPTER = make_pipeline_adapter("automatic-speech-recognition", name="KyutaiSttAdapter")
