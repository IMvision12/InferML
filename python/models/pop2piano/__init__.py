"""Pop2Piano. Audio-to-MIDI conversion (pop song → piano arrangement).

Registered in transformers as `pop2piano` → `Pop2PianoForConditionalGeneration`
(in SpeechSeq2Seq). HF lists the official `sweetcocoa/pop2piano` repo with
`pipeline_tag: automatic-speech-recognition` even though the actual output
is symbolic MIDI tokens. Routed through the ASR pipeline path; the user
gets text/token output until a dedicated MIDI workspace is built.
"""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["pop2piano"]
TASK = "automatic-speech-recognition"
ADAPTER = make_pipeline_adapter("automatic-speech-recognition", name="Pop2PianoAdapter")
