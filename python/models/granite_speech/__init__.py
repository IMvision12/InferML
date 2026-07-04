"""IBM Granite Speech. Speech-to-text + speech translation.

Registered in transformers as a SpeechSeq2Seq model
(`GraniteSpeechForConditionalGeneration`), so the standard
`pipeline("automatic-speech-recognition")` path loads it without quirks.
Smallest checkpoint: `ibm-granite/granite-speech-3.3-2b`.

Note: a `granite_speech_plus` model_type does not exist in current
transformers. If IBM ships such a class later, add it to MODEL_TYPES.
"""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["granite_speech"]
TASK = "automatic-speech-recognition"
ADAPTER = make_pipeline_adapter("automatic-speech-recognition", name="GraniteSpeechAdapter")
