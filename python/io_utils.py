"""Shared input decoding + device resolution."""
from __future__ import annotations

import base64
import io


_DEVICE_CACHE = None


def resolve_device():
    global _DEVICE_CACHE
    if _DEVICE_CACHE is not None:
        return _DEVICE_CACHE
    try:
        import torch
        if torch.cuda.is_available():
            _DEVICE_CACHE = torch.device("cuda")
        elif getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
            _DEVICE_CACHE = torch.device("mps")
        else:
            _DEVICE_CACHE = torch.device("cpu")
    except Exception:
        _DEVICE_CACHE = False
    return _DEVICE_CACHE


def pipeline_device_arg():
    dev = resolve_device()
    if dev is False:
        return -1
    if getattr(dev, "type", None) == "cuda":
        return 0
    if getattr(dev, "type", None) == "mps":
        return dev
    return -1


def torch_dtype_for_device():
    import torch
    dev = resolve_device()
    if getattr(dev, "type", None) in ("cuda", "mps"):
        return torch.float16
    return torch.float32


def decode_image(data_url: str):
    from PIL import Image
    if "," in data_url:
        data_url = data_url.split(",", 1)[1]
    raw = base64.b64decode(data_url)
    return Image.open(io.BytesIO(raw)).convert("RGB")


def decode_audio(data_url: str):
    import numpy as np
    import soundfile as sf
    if "," in data_url:
        data_url = data_url.split(",", 1)[1]
    raw = base64.b64decode(data_url)
    audio, sr = sf.read(io.BytesIO(raw))
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    audio = audio.astype(np.float32)
    if sr != 16000:
        import librosa
        audio = librosa.resample(audio, orig_sr=sr, target_sr=16000)
    return audio, 16000
