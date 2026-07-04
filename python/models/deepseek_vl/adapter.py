"""DeepSeek-VL v1 family. Image-text-to-text VLM.

Loads via transformers' native `DeepseekVLForConditionalGeneration` /
`DeepseekVLHybridForConditionalGeneration`. The original
`deepseek-ai/deepseek-vl-*` repos use `model_type: multi_modality` and
cannot load. Use the **community fork** at
`deepseek-community/deepseek-vl-*` which reuploads identical weights with
the canonical config.

Variants:
- 1.3b-chat / 1.3b-base → `model_type: deepseek_vl`
- 7b-chat   / 7b-base   → `model_type: deepseek_vl_hybrid`

DeepSeek-VL v2 (`deepseek_vl_v2`) is currently NOT in transformers'
auto-config registry. those repos are filtered out at the JSON whitelist
level until transformers adds support.
"""
from __future__ import annotations

from adapters.base import Adapter
import output_kinds as ok
from io_utils import decode_image, resolve_device, torch_dtype_for_device


class DeepSeekVLAdapter(Adapter):
    @classmethod
    def can_handle(cls, info):
        mid = (info.get("model_id") or "").lower()
        mt = (info.get("model_type") or "").lower()
        if mt in ("deepseek_vl", "deepseek_vl_hybrid"):
            return True
        if "deepseek-vl-1.3b" in mid or "deepseek-vl-7b" in mid:
            return True
        return False

    def load(self, info, device):
        from transformers import AutoProcessor
        self.info = info
        dtype = torch_dtype_for_device()
        trust = bool(self.override.get("trust_remote_code", False))
        mt = (info.get("model_type") or "").lower()
        if mt == "deepseek_vl_hybrid":
            from transformers import DeepseekVLHybridForConditionalGeneration as ModelClass
        else:
            from transformers import DeepseekVLForConditionalGeneration as ModelClass
        self.processor = AutoProcessor.from_pretrained(info["model_id"], trust_remote_code=trust)
        self.model = ModelClass.from_pretrained(info["model_id"], torch_dtype=dtype, trust_remote_code=trust)
        dev = resolve_device()
        if dev is not False:
            self.model = self.model.to(dev)
        self.model.eval()

    def run(self, inputs, params):
        import torch
        if not inputs.get("dataUrl"):
            keys = sorted(inputs.keys()) if isinstance(inputs, dict) else type(inputs).__name__
            raise ValueError(f"DeepSeek-VL needs an image (no dataUrl in inputs; received keys={keys})")
        img = decode_image(inputs["dataUrl"])
        text = (inputs.get("text") or "").strip() or "Describe this image in detail."

        messages = [{
            "role": "user",
            "content": [
                {"type": "image", "image": img},
                {"type": "text", "text": text},
            ],
        }]
        proc_inputs = self.processor.apply_chat_template(
            messages,
            tokenize=True,
            return_dict=True,
            return_tensors="pt",
            add_generation_prompt=True,
        )
        dev = resolve_device()
        if dev is not False:
            proc_inputs = {k: v.to(dev) if hasattr(v, "to") else v for k, v in proc_inputs.items()}

        gen_kwargs = {
            "max_new_tokens": int(params.get("max_new_tokens", 256)),
            "do_sample": bool(params.get("do_sample", False)),
        }
        if gen_kwargs["do_sample"]:
            if "temperature" in params: gen_kwargs["temperature"] = float(params["temperature"])
            if "top_p" in params:       gen_kwargs["top_p"] = float(params["top_p"])

        with torch.no_grad():
            generate_ids = self.model.generate(**proc_inputs, **gen_kwargs)
        decoded = self.processor.batch_decode(generate_ids, skip_special_tokens=True)[0]
        prompt_text = self.processor.batch_decode(proc_inputs["input_ids"], skip_special_tokens=True)[0]
        if decoded.startswith(prompt_text):
            decoded = decoded[len(prompt_text):]
        return ok.text(decoded.strip())
