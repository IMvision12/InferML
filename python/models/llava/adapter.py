"""LLaVA family. Chat-templated VLMs."""
from __future__ import annotations

from adapters.base import Adapter
import output_kinds as ok
from io_utils import decode_image, resolve_device, torch_dtype_for_device


# Trust list. Official LLaVA orgs that publish weights without backdoors.
# Other owners need explicit `trust_remote_code: true` in model_overrides.json.
_TRUSTED_LLAVA_OWNERS = {"llava-hf", "liuhaotian"}


class LlavaAdapter(Adapter):
    @classmethod
    def can_handle(cls, info):
        mid = (info.get("model_id") or "").lower()
        mt = (info.get("model_type") or "").lower()
        return "llava" in mid or mt.startswith("llava")

    def load(self, info, device):
        from transformers import AutoProcessor, LlavaForConditionalGeneration
        self.info = info
        dtype = torch_dtype_for_device()
        # See _TRUSTED_LLAVA_OWNERS. Random forks need an explicit override
        # before we'll execute their custom modeling_*.py during load.
        owner = (info.get("model_id") or "").split("/")[0].lower()
        trust_default = owner in _TRUSTED_LLAVA_OWNERS
        trust = bool(self.override.get("trust_remote_code", trust_default))
        self.processor = AutoProcessor.from_pretrained(info["model_id"], trust_remote_code=trust)
        try:
            self.model = LlavaForConditionalGeneration.from_pretrained(info["model_id"], torch_dtype=dtype)
        except Exception:
            # LLaVA-Next, LLaVA-1.6 etc. need their specific class. Try the
            # modern image-text-to-text auto-class first; if that's missing
            # (very old transformers), fall through to AutoModelForCausalLM.
            try:
                from transformers import AutoModelForImageTextToText
                self.model = AutoModelForImageTextToText.from_pretrained(
                    info["model_id"], torch_dtype=dtype, trust_remote_code=trust
                )
            except Exception:
                from transformers import AutoModelForCausalLM
                self.model = AutoModelForCausalLM.from_pretrained(
                    info["model_id"], torch_dtype=dtype, trust_remote_code=trust
                )
        dev = resolve_device()
        if dev is not False:
            self.model = self.model.to(dev)
        self.model.eval()

    def run(self, inputs, params):
        import torch
        if not inputs.get("dataUrl"):
            raise ValueError("LLaVA needs an image")
        img = decode_image(inputs["dataUrl"])
        text = (inputs.get("text") or "").strip() or "Describe this image."

        # LLaVA's template expects <image> tokens interleaved with text. The
        # processor handles this when you pass `conversation` or `text` + images.
        conversation = [{
            "role": "user",
            "content": [
                {"type": "image"},
                {"type": "text", "text": text},
            ],
        }]
        try:
            prompt = self.processor.apply_chat_template(conversation, add_generation_prompt=True)
        except Exception:
            # Older LLaVA processors don't have apply_chat_template. Fall back
            # to the classic "USER: <image>\n{prompt} ASSISTANT:" format.
            prompt = f"USER: <image>\n{text} ASSISTANT:"

        inputs_t = self.processor(images=img, text=prompt, return_tensors="pt")
        dev = resolve_device()
        if dev is not False:
            inputs_t = {k: v.to(dev) for k, v in inputs_t.items()}

        gen_kwargs = {
            "max_new_tokens": int(params.get("max_new_tokens", 512)),
            "do_sample": bool(params.get("do_sample", False)),
        }
        if gen_kwargs["do_sample"]:
            if "temperature" in params: gen_kwargs["temperature"] = float(params["temperature"])
            if "top_p" in params:       gen_kwargs["top_p"] = float(params["top_p"])
        with torch.no_grad():
            out = self.model.generate(**inputs_t, **gen_kwargs)
        decoded = self.processor.decode(out[0], skip_special_tokens=True)
        # Strip the prompt echo that LLaVA returns.
        if "ASSISTANT:" in decoded:
            decoded = decoded.split("ASSISTANT:", 1)[1].strip()
        return ok.text(decoded)
