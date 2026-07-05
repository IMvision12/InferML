"""Simpler tasks - one variant each. Kept in one file to avoid noise; they can
each be split out when a second variant is needed."""
from __future__ import annotations

from .base import TaskHandler, TaskVariant
import output_kinds as ok

_XVECT_ZIP = None
_XVECT_NAMES = None

def _load_speaker_embedding(speaker_index: int):
    """Return a 512-d CMU-Arctic x-vector (shape [1, 512], float32) for
    SpeechT5. Index 7306 in the alphabetically-sorted file list is the
    `slt` female speaker - same voice the HF tutorials use."""
    import io
    import zipfile
    import numpy as np
    import torch
    from huggingface_hub import hf_hub_download
    global _XVECT_ZIP, _XVECT_NAMES
    if _XVECT_ZIP is None:
        zip_path = hf_hub_download(
            repo_id="Matthijs/cmu-arctic-xvectors",
            filename="spkrec-xvect.zip",
            repo_type="dataset",
        )
        _XVECT_ZIP = zipfile.ZipFile(zip_path)
        _XVECT_NAMES = sorted(n for n in _XVECT_ZIP.namelist() if n.endswith(".npy"))
    n = len(_XVECT_NAMES)
    idx = max(0, min(int(speaker_index), n - 1))
    arr = np.load(io.BytesIO(_XVECT_ZIP.read(_XVECT_NAMES[idx])))
    return torch.tensor(arr).unsqueeze(0)

def _is_speecht5(info: dict) -> bool:
    mid = (info.get("model_id") or "").lower()
    mt  = (info.get("model_type") or "").lower()
    return "speecht5" in mid or "speecht5" in mt

class SpeechT5Variant(TaskVariant):
    """SpeechT5 needs two things the generic TTS pipeline doesn't reliably set
    up on its own: (1) a 512-d speaker x-vector at inference time, (2) an
    explicit HiFiGAN vocoder to convert mel spectrograms to audio.

    Going through `pipeline("text-to-speech")` has been observed to crash with
    a Windows access violation (exit code 0xC0000005) - almost certainly
    because the pipeline path returns spectrograms when the vocoder hasn't
    been wired up, and the post-processing step then dereferences bad memory.

    We bypass the pipeline entirely: reuse the model + processor that
    StandardPipelineAdapter already loaded, lazy-load the vocoder once, and
    call `model.generate_speech()` directly. Cached vocoder lives on `state`
    so subsequent runs are instant."""
    name = "speecht5"

    def can_handle(self, info, inputs):
        return _is_speecht5(info) and bool((inputs.get("text") or "").strip())

    def run(self, state, inputs, params):
        import torch
        text = inputs["text"].strip()
        speaker_index = int(params.get("speaker_index", 7306))

        model = state.model
        processor = state.processor
        if model is None or processor is None:
            raise RuntimeError("SpeechT5 pipeline didn't expose a model/processor")

        try:
            dev = next(model.parameters()).device
        except (StopIteration, AttributeError):
            dev = None

        vocoder = getattr(state, "_speecht5_vocoder", None)
        if vocoder is None:
            from transformers import SpeechT5HifiGan
            vocoder = SpeechT5HifiGan.from_pretrained("microsoft/speecht5_hifigan")
            if dev is not None:
                vocoder = vocoder.to(dev)
            vocoder.eval()
            state._speecht5_vocoder = vocoder

        speaker_embeddings = _load_speaker_embedding(speaker_index)
        if dev is not None:
            speaker_embeddings = speaker_embeddings.to(dev)

        inputs_t = processor(text=text, return_tensors="pt")
        if dev is not None:
            inputs_t = {k: (v.to(dev) if hasattr(v, "to") else v) for k, v in inputs_t.items()}

        with torch.no_grad():
            speech = model.generate_speech(
                inputs_t["input_ids"],
                speaker_embeddings,
                vocoder=vocoder,
            )
        audio = speech.detach().cpu().numpy()
        return ok.audio(audio, 16000)

class TextToSpeechVariant(TaskVariant):
    """VITS, Bark, MMS-TTS, FastSpeech2, MusicGen - anything that doesn't need
    an external speaker conditioning tensor."""
    name = "standard"

    def can_handle(self, info, inputs):
        return bool((inputs.get("text") or "").strip())

    def run(self, state, inputs, params):
        text = inputs["text"].strip()
        result = state.pipe(text)
        audio = result.get("audio")
        sr = int(result.get("sampling_rate") or 16000)
        if audio is None:
            raise ValueError("TTS pipeline returned no audio")
        if hasattr(audio, "squeeze"):
            audio = audio.squeeze()
        return ok.audio(audio, sr)

class TextToSpeechTask(TaskHandler):
    name = "text-to-speech"
    output_kind = "audio"
    default_params = {}
    variants = [SpeechT5Variant(), TextToSpeechVariant()]
