"""Voxtral. Mistral's audio LM (ASR + speech translation + audio chat).

Registered in transformers as a SpeechSeq2Seq model
(`VoxtralForConditionalGeneration`). The official Mistral uploads
(`mistralai/Voxtral-Mini-3B-2507`, `Voxtral-Small-24B-2507`) declare
`library_name: mistral-common` (small) or `library_name: vllm` (large).
We accept `mistral-common` via the renderer's TRUST_REMOTE_CODE_LIBRARIES
allowlist so transformers' voxtral support can pick them up; vllm-tagged
repos stay out (vllm is a separate runtime we don't ship).

Both voxtral and voxtral_realtime are gated. Set HF token in Settings →
HF Token before downloading.
"""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["voxtral", "voxtral_realtime"]
TASK = "automatic-speech-recognition"
ADAPTER = make_pipeline_adapter("automatic-speech-recognition", name="VoxtralAdapter")
