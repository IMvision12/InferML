"""Janus family. DeepSeek's unified gen + understanding VLM.

Loads via transformers' native `JanusForConditionalGeneration` (added in
recent transformers releases). The original `deepseek-ai/Janus-Pro-*` repos
use `model_type: multi_modality` (incompatible). The community fork at
`deepseek-community/Janus-Pro-*` reuploads the same weights with
`model_type: janus` so transformers can load them directly.

The pipeline_tag on these repos is `any-to-any` because Janus also generates
images. The renderer's chat workspace exposes a 2-button mode picker
(Understand / Generate). The selected mode arrives as `params.janus_mode`.
"""
from __future__ import annotations

from adapters.base import Adapter
import output_kinds as ok
from io_utils import decode_image, resolve_device, torch_dtype_for_device

class JanusAdapter(Adapter):
    @classmethod
    def can_handle(cls, info):
        mid = (info.get("model_id") or "").lower()
        mt = (info.get("model_type") or "").lower()
        return "janus" in mid or mt == "janus"

    def load(self, info, device):
        from transformers import AutoProcessor, JanusForConditionalGeneration
        self.info = info
        dtype = torch_dtype_for_device()
        trust = bool(self.override.get("trust_remote_code", False))
        self.processor = AutoProcessor.from_pretrained(info["model_id"], trust_remote_code=trust)
        self.model = JanusForConditionalGeneration.from_pretrained(
            info["model_id"], torch_dtype=dtype, trust_remote_code=trust
        )
        dev = resolve_device()
        if dev is not False:
            self.model = self.model.to(dev)
        self.model.eval()

    def run(self, inputs, params):
        mode = (params.get("janus_mode") or "understand").lower()
        if mode == "generate":
            return self._run_generate(inputs, params)
        return self._run_understand(inputs, params)

    def _run_understand(self, inputs, params):
        import torch
        if not inputs.get("dataUrl"):
            keys = sorted(inputs.keys()) if isinstance(inputs, dict) else type(inputs).__name__
            raise ValueError(f"Janus understand mode needs an image (no dataUrl in inputs; received keys={keys})")
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

    def _run_generate(self, inputs, params):
        import torch
        from PIL import Image
        text = (inputs.get("text") or "").strip()
        if not text:
            raise ValueError("Janus generate mode needs a text prompt")

        messages = [{
            "role": "user",
            "content": [{"type": "text", "text": text}],
        }]
        proc_inputs = self.processor.apply_chat_template(
            messages,
            tokenize=True,
            return_dict=True,
            return_tensors="pt",
            add_generation_prompt=True,
            generation_mode="image",
        )
        dev = resolve_device()
        if dev is not False:
            proc_inputs = {k: v.to(dev) if hasattr(v, "to") else v for k, v in proc_inputs.items()}

        guidance = float(params.get("guidance_scale", 5.0))
        with torch.no_grad():
            image_tokens = self.model.generate(
                **proc_inputs,
                generation_mode="image",
                do_sample=True,
                use_cache=True,
                num_return_sequences=1,
                guidance_scale=guidance,
            )
        decoded = self.model.decode_image_tokens(image_tokens)
        arr = decoded.float().detach().cpu()
        arr = ((arr.clamp(-1, 1) + 1) / 2 * 255).to(torch.uint8).numpy()
        pil = Image.fromarray(arr[0])
        return ok.image(pil)
