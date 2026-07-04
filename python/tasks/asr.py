"""automatic-speech-recognition - one variant that decides chunking from
actual audio duration and renders inline timestamps when requested."""
from __future__ import annotations

from .base import TaskHandler, TaskVariant
from io_utils import decode_audio
import output_kinds as ok


def _format_timestamp(t):
    """Convert a Whisper timestamp (float seconds) to mm:ss.d. Some chunks
    report (start, None) for the last chunk - render `?` in that case."""
    if t is None:
        return "?"
    mins = int(t) // 60
    secs = t - mins * 60
    return f"{mins:02d}:{secs:05.2f}"


class ASRVariant(TaskVariant):
    """Single variant: decode audio, compute duration, pass through the user's
    chunking / timestamp params. Earlier versions had separate short/long
    variants keyed on an `inputs.duration_seconds` field that the JS side
    never actually sent - LongAudioVariant was dead code and the user's
    chunk / timestamp params were silently ignored."""
    name = "standard"

    def can_handle(self, info, inputs):
        return bool(inputs.get("dataUrl"))

    def run(self, state, inputs, params):
        audio, sr = decode_audio(inputs["dataUrl"])
        duration_s = float(len(audio)) / float(sr) if sr else 0.0
        want_timestamps = bool(params.get("return_timestamps", False))
        # Whisper-only: "transcribe" (default) preserves source language;
        # "translate" forces English output regardless of source. Other ASR
        # families (Wav2Vec2, Parakeet, etc.) ignore this - we only attach
        # the generate kwarg when the model id looks like Whisper.
        whisper_mode = (params.get("whisper_mode") or "transcribe").strip().lower()
        is_whisper = "whisper" in (state.info.get("model_id") or "").lower()

        kwargs = {}
        # Only pass chunking kwargs when actually needed. Whisper pipelines
        # accept them any time, but older Wav2Vec2/Parakeet pipelines may not.
        # For sub-30s audio, one forward pass is fine.
        if duration_s > 30:
            kwargs["chunk_length_s"] = int(params.get("chunk_length_s", 30))
            kwargs["stride_length_s"] = int(params.get("stride_length_s", 5))
        if want_timestamps:
            # `True` for segment-level, `"word"` for word-level. HF accepts
            # either; we expose a simple bool and default to segment-level.
            kwargs["return_timestamps"] = True
        if is_whisper and whisper_mode == "translate":
            kwargs.setdefault("generate_kwargs", {})["task"] = "translate"

        result = state.pipe({"array": audio, "sampling_rate": sr}, **kwargs)
        text = (result.get("text") or "").strip()
        chunks = result.get("chunks")
        if want_timestamps and chunks:
            lines = []
            for c in chunks:
                ts = c.get("timestamp") or (None, None)
                start = ts[0] if len(ts) > 0 else None
                end = ts[1] if len(ts) > 1 else None
                seg = (c.get("text") or "").strip()
                if not seg:
                    continue
                lines.append(f"[{_format_timestamp(start)} → {_format_timestamp(end)}] {seg}")
            if lines:
                return ok.text("\n".join(lines))
        return ok.text(text)


class ASRTask(TaskHandler):
    name = "automatic-speech-recognition"
    output_kind = "text"
    default_params = {"chunk_length_s": 30, "stride_length_s": 5}
    variants = [ASRVariant()]
