"""Dia. nari-labs' open TTS (`nari-labs/Dia-1.6B`).

Registered in transformers as `dia` → `DiaForConditionalGeneration` (in
SpeechSeq2Seq). The original nari-labs repo declares `library_name: null`
and `pipeline_tag: text-to-speech` but doesn't include a `dia` tag, so it
may not surface until a community re-upload tags it canonically. Adding
this folder so any properly-tagged Dia repo loads through standard TTS.
"""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["dia"]
TASK = "text-to-speech"
ADAPTER = make_pipeline_adapter("text-to-speech", name="DiaAdapter")
