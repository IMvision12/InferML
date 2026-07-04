"""image-to-text — variants: unconditioned captioning, VQA.

Newer `transformers` merged `image-to-text` into `image-text-to-text` and the
new pipeline requires a non-empty text argument. BLIP/GIT captioners are built
to generate from image alone — so when no text is given, we bypass the
pipeline and call `model.generate()` directly through the processor."""
from __future__ import annotations

from .base import TaskHandler, TaskVariant, LoadedPipeline
from io_utils import decode_image
import output_kinds as ok


class UnconditionedCaptionVariant(TaskVariant):
    """No text input → call the underlying model directly.

    Works for BLIP, GIT, Pix2Struct, ViT-GPT2 — any encoder-decoder captioner."""
    name = "unconditioned-caption"

    def can_handle(self, info, inputs):
        has_image = bool(inputs.get("dataUrl"))
        has_text = bool((inputs.get("text") or "").strip())
        return has_image and not has_text

    def run(self, state, inputs, params):
        import torch
        img = decode_image(inputs["dataUrl"])
        processor = state.processor
        model = state.model
        if processor is None or model is None:
            raise ValueError("Captioner pipeline didn't expose a processor or model")

        inputs_t = processor(images=img, return_tensors="pt")
        try:
            dev = next(model.parameters()).device
            inputs_t = {k: (v.to(dev) if hasattr(v, "to") else v) for k, v in inputs_t.items()}
        except StopIteration:
            pass

        gen_kwargs = {
            "max_new_tokens": int(params.get("max_new_tokens", 60)),
            "do_sample": bool(params.get("do_sample", False)),
        }
        if gen_kwargs["do_sample"]:
            if "temperature" in params: gen_kwargs["temperature"] = float(params["temperature"])
            if "top_p" in params:       gen_kwargs["top_p"] = float(params["top_p"])

        with torch.no_grad():
            out_ids = model.generate(**inputs_t, **gen_kwargs)
        tok = getattr(processor, "tokenizer", None) or processor
        caption = tok.decode(out_ids[0], skip_special_tokens=True)
        return ok.text(caption)


class VQAVariant(TaskVariant):
    """User provided a text prompt → standard image-text-to-text pipeline."""
    name = "vqa"

    def can_handle(self, info, inputs):
        return bool(inputs.get("dataUrl")) and bool((inputs.get("text") or "").strip())

    def run(self, state, inputs, params):
        img = decode_image(inputs["dataUrl"])
        text = (inputs.get("text") or "").strip()
        # Only pass sampling kwargs when do_sample is on — otherwise HF warns
        # about "temperature has no effect when do_sample=False" in the logs.
        kwargs = {"max_new_tokens": int(params.get("max_new_tokens", 256)),
                  "do_sample": bool(params.get("do_sample", False))}
        if kwargs["do_sample"]:
            if "temperature" in params: kwargs["temperature"] = float(params["temperature"])
            if "top_p" in params:       kwargs["top_p"] = float(params["top_p"])
        try:
            result = state.pipe(images=img, text=text, **kwargs)
        except TypeError:
            # Newer conversational pipelines expect a `messages` list.
            messages = [{"role": "user", "content": [
                {"type": "image", "image": img},
                {"type": "text", "text": text},
            ]}]
            result = state.pipe(text=messages, **kwargs)

        r0 = result[0] if isinstance(result, list) else result
        gen = r0.get("generated_text") if isinstance(r0, dict) else None
        if isinstance(gen, list):
            assistant = next((m for m in reversed(gen) if m.get("role") == "assistant"), None)
            gen = assistant.get("content", "") if assistant else ""
        return ok.text(gen or (r0.get("text") if isinstance(r0, dict) else "") or "")


class ImageToTextTask(TaskHandler):
    name = "image-to-text"
    output_kind = "text"
    default_params = {"max_new_tokens": 60}
    # newer transformers renamed this task; pipeline registry uses the new name.
    _runtime_task = "image-text-to-text"
    variants = [UnconditionedCaptionVariant(), VQAVariant()]


class ImageTextToTextTask(ImageToTextTask):
    """The same machinery — this is just the renamed task so routing works
    for models tagged either way on HF."""
    name = "image-text-to-text"
