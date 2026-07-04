"""Qwen-VL family. Needs the processor's chat-template message format."""
from __future__ import annotations

from adapters.base import Adapter
import output_kinds as ok
from io_utils import decode_image, resolve_device, torch_dtype_for_device


# Owners we trust to ship Qwen-VL weights without backdoors. Models from
# anyone else need an explicit `trust_remote_code: true` in model_overrides.json
# before we'll execute their custom modeling_*.py during load.
_TRUSTED_QWEN_OWNERS = {"qwen"}


class QwenVLAdapter(Adapter):
    @classmethod
    def can_handle(cls, info):
        mid = (info.get("model_id") or "").lower()
        mt = (info.get("model_type") or "").lower()
        return "qwen" in mid and ("-vl" in mid or "vl" in mt)

    def load(self, info, device):
        from transformers import AutoProcessor
        self.info = info
        dtype = torch_dtype_for_device()
        # `trust_remote_code` defaults TRUE only when the model owner is on
        # the trusted list above. A user picking `random_user/qwen-vl-evil`
        # gets trust=False and loading fails with a clear "set
        # trust_remote_code=True" error from transformers, letting them
        # opt in via model_overrides.json if they actually want to. Without
        # this gate, any malicious HF upload matching `qwen` + `vl` could
        # execute arbitrary Python in our sidecar on first inference.
        owner = (info.get("model_id") or "").split("/")[0].lower()
        trust_default = owner in _TRUSTED_QWEN_OWNERS
        trust = bool(self.override.get("trust_remote_code", trust_default))
        self.processor = AutoProcessor.from_pretrained(info["model_id"], trust_remote_code=trust)

        # Pick the model class. Prefer AutoModelForImageTextToText (added in
        # transformers ~4.50), which auto-dispatches to the right
        # *ForConditionalGeneration class for any registered VLM config:
        # Qwen2-VL, Qwen2.5-VL, Qwen3-VL, LLaVA, etc. Without it, the previous
        # code fell through to AutoModelForCausalLM for unknown VLMs (Qwen3-VL,
        # future Qwen-N-VL, ...) and crashed with "Unrecognized configuration
        # class ... for AutoModelForCausalLM."
        ModelCls = None
        try:
            from transformers import AutoModelForImageTextToText as ModelCls
        except ImportError:
            mt = (info.get("model_type") or "").lower()
            mid = (info.get("model_id") or "").lower()
            if "qwen3_vl" in mt or "qwen3-vl" in mid:
                from transformers import Qwen3VLForConditionalGeneration as ModelCls
            elif "qwen2_5_vl" in mt or "qwen2.5-vl" in mid:
                from transformers import Qwen2_5_VLForConditionalGeneration as ModelCls
            elif "qwen2_vl" in mt or "qwen2-vl" in mid:
                from transformers import Qwen2VLForConditionalGeneration as ModelCls
            else:
                from transformers import AutoModel as ModelCls

        self.model = ModelCls.from_pretrained(
            info["model_id"], torch_dtype=dtype, trust_remote_code=trust
        )
        dev = resolve_device()
        if dev is not False:
            self.model = self.model.to(dev)
        self.model.eval()

    def run(self, inputs, params):
        import torch
        if not inputs.get("dataUrl"):
            raise ValueError("Qwen-VL needs an image")
        img = decode_image(inputs["dataUrl"])
        text = (inputs.get("text") or "").strip() or "Describe this image."

        messages = [{
            "role": "user",
            "content": [
                {"type": "image", "image": img},
                {"type": "text", "text": text},
            ],
        }]
        prompt = self.processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)

        inputs_t = self.processor(text=[prompt], images=[img], padding=True, return_tensors="pt")
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
            out_ids = self.model.generate(**inputs_t, **gen_kwargs)
        generated = out_ids[:, inputs_t["input_ids"].shape[1]:]
        decoded = self.processor.batch_decode(
            generated, skip_special_tokens=True, clean_up_tokenization_spaces=False
        )[0]
        return ok.text(decoded)
