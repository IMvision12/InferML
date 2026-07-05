"""Wav2Vec2 family + close cousins (Conformer / BERT variants).

Catch-all for ASR architectures other than Whisper / Seamless / Moonshine /
Parakeet (each of which has its own folder). All route through the same
`pipeline("automatic-speech-recognition")` path.
"""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = [
    "wav2vec2", "wav2vec2-conformer", "wav2vec2_conformer",
    "wav2vec2-bert", "wav2vec2_bert",
    "hubert", "wavlm",
    "data2vec-audio", "data2vec_audio",
    "unispeech", "unispeech-sat", "unispeech_sat",
    "sew", "sew-d", "sew_d",
    "mctct",
    "speech-to-text", "speech_to_text",
    "qwen2_audio",
]
TASK = "automatic-speech-recognition"
ADAPTER = make_pipeline_adapter("automatic-speech-recognition", name="Wav2Vec2Adapter")
