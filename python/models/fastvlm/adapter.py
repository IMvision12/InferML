"""FastVLM family. Apple's image-text-to-text model.

Apple ships these under `library_name: ml-fastvlm` with a custom
`llava_qwen.py` modeling file. Loads through the standard trust_remote_code
path, but inference can't go through `transformers.pipeline(...)` because
the model expects an image-token sentinel (-200) spliced into input_ids
manually rather than an `<image>` string + AutoProcessor pair.
"""
from __future__ import annotations

from adapters.base import Adapter
import output_kinds as ok
from io_utils import decode_image, resolve_device, torch_dtype_for_device


_TRUSTED_FASTVLM_OWNERS = {"apple"}
_IMAGE_TOKEN_INDEX = -200


class FastVLMAdapter(Adapter):
    @classmethod
    def can_handle(cls, info):
        mid = (info.get("model_id") or "").lower()
        mt = (info.get("model_type") or "").lower()
        tags = [str(t).lower() for t in (info.get("tags") or [])]
        if "fastvlm" in mid:
            return True
        if "ml-fastvlm" in tags:
            return True
        if mt == "llava_qwen2":
            return True
        return False

    def load(self, info, device):
        from transformers import AutoTokenizer, AutoModelForCausalLM
        self.info = info
        owner = (info.get("model_id") or "").split("/")[0].lower()
        trust_default = owner in _TRUSTED_FASTVLM_OWNERS
        trust = bool(self.override.get("trust_remote_code", trust_default))
        dtype = torch_dtype_for_device()
        self.tokenizer = AutoTokenizer.from_pretrained(info["model_id"], trust_remote_code=trust)
        self.model = AutoModelForCausalLM.from_pretrained(
            info["model_id"],
            torch_dtype=dtype,
            device_map="auto" if resolve_device() is not False else None,
            trust_remote_code=trust,
        )
        self.model.eval()

    def run(self, inputs, params):
        import torch
        if not inputs.get("dataUrl"):
            keys = sorted(inputs.keys()) if isinstance(inputs, dict) else type(inputs).__name__
            raise ValueError(f"FastVLM needs an image (no dataUrl in inputs; received keys={keys})")
        img = decode_image(inputs["dataUrl"])
        text = (inputs.get("text") or "").strip() or "Describe this image in detail."

        messages = [{"role": "user", "content": f"<image>\n{text}"}]
        rendered = self.tokenizer.apply_chat_template(
            messages, add_generation_prompt=True, tokenize=False
        )
        if "<image>" not in rendered:
            raise ValueError("FastVLM chat template did not emit an <image> placeholder")
        pre, post = rendered.split("<image>", 1)
        pre_ids = self.tokenizer(pre, return_tensors="pt", add_special_tokens=False).input_ids
        post_ids = self.tokenizer(post, return_tensors="pt", add_special_tokens=False).input_ids
        img_tok = torch.tensor([[_IMAGE_TOKEN_INDEX]], dtype=pre_ids.dtype)
        input_ids = torch.cat([pre_ids, img_tok, post_ids], dim=1).to(self.model.device)
        attention_mask = torch.ones_like(input_ids, device=self.model.device)

        px = self.model.get_vision_tower().image_processor(
            images=img, return_tensors="pt"
        )["pixel_values"]
        px = px.to(self.model.device, dtype=self.model.dtype)

        gen_kwargs = {
            "max_new_tokens": int(params.get("max_new_tokens", 256)),
            "do_sample": bool(params.get("do_sample", False)),
        }
        if gen_kwargs["do_sample"]:
            if "temperature" in params: gen_kwargs["temperature"] = float(params["temperature"])
            if "top_p" in params:       gen_kwargs["top_p"] = float(params["top_p"])

        with torch.no_grad():
            out = self.model.generate(
                inputs=input_ids,
                attention_mask=attention_mask,
                images=px,
                **gen_kwargs,
            )
        decoded = self.tokenizer.decode(out[0], skip_special_tokens=True)
        if "assistant" in decoded.lower():
            tail = decoded.lower().rfind("assistant")
            decoded = decoded[tail:].split("\n", 1)[-1] if "\n" in decoded[tail:] else decoded[tail:]
            for marker in ("assistant\n", "assistant:", "ASSISTANT:"):
                if decoded.startswith(marker):
                    decoded = decoded[len(marker):]
                    break
        return ok.text(decoded.strip())
