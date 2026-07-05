"""Florence-2 family. Multi-task vision model driven by task tokens.

Task is selected via `params.florence_task` (or defaults to `<CAPTION>`).
Supported tokens include `<CAPTION>`, `<DETAILED_CAPTION>`, `<OD>`,
`<DENSE_REGION_CAPTION>`, `<REFERRING_EXPRESSION_SEGMENTATION>`, etc.
"""
from __future__ import annotations

from adapters.base import Adapter
import output_kinds as ok
from io_utils import decode_image, resolve_device, torch_dtype_for_device

_TRUSTED_FLORENCE_OWNERS = {"microsoft"}

class Florence2Adapter(Adapter):
    DEFAULT_TASK = "<CAPTION>"

    @classmethod
    def can_handle(cls, info):
        mid = (info.get("model_id") or "").lower()
        return "florence-2" in mid or "florence2" in mid

    def load(self, info, device):
        from transformers import AutoProcessor, AutoModelForCausalLM
        self.info = info
        dtype = torch_dtype_for_device()
        owner = (info.get("model_id") or "").split("/")[0].lower()
        trust_default = owner in _TRUSTED_FLORENCE_OWNERS
        trust = bool(self.override.get("trust_remote_code", trust_default))
        self.processor = AutoProcessor.from_pretrained(info["model_id"], trust_remote_code=trust)
        self.model = AutoModelForCausalLM.from_pretrained(
            info["model_id"], trust_remote_code=trust, torch_dtype=dtype
        )
        dev = resolve_device()
        if dev is not False:
            self.model = self.model.to(dev)
        self.model.eval()

    def run(self, inputs, params):
        import torch
        if not inputs.get("dataUrl"):
            raise ValueError("Florence-2 needs an image")
        img = decode_image(inputs["dataUrl"])
        task_token = params.get("florence_task") or self.DEFAULT_TASK
        prompt_text = (inputs.get("text") or "").strip()
        prompt = task_token + (prompt_text if prompt_text else "")

        inputs_t = self.processor(text=prompt, images=img, return_tensors="pt")
        dev = resolve_device()
        if dev is not False:
            inputs_t = {k: v.to(dev) for k, v in inputs_t.items()}

        with torch.no_grad():
            gen = self.model.generate(
                input_ids=inputs_t["input_ids"],
                pixel_values=inputs_t["pixel_values"],
                max_new_tokens=int(params.get("max_new_tokens", 1024)),
                do_sample=False,
                num_beams=3,
            )
        text = self.processor.batch_decode(gen, skip_special_tokens=False)[0]
        parsed = self.processor.post_process_generation(
            text, task=task_token, image_size=(img.width, img.height)
        )
        result = parsed.get(task_token, parsed)

        if isinstance(result, dict) and "bboxes" in result and "labels" in result:
            W, H = img.width, img.height
            items = []
            for bbox, lab in zip(result["bboxes"], result["labels"]):
                x1, y1, x2, y2 = bbox
                items.append({
                    "label": lab,
                    "score": 1.0,
                    "box": [x1 / W, y1 / H, (x2 - x1) / W, (y2 - y1) / H],
                })
            return ok.boxes(items)

        if isinstance(result, dict) and "bboxes" in result and "bboxes_labels" in result:
            W, H = img.width, img.height
            items = []
            for bbox, lab in zip(result["bboxes"], result["bboxes_labels"]):
                x1, y1, x2, y2 = bbox
                items.append({
                    "label": lab, "score": 1.0,
                    "box": [x1 / W, y1 / H, (x2 - x1) / W, (y2 - y1) / H],
                })
            return ok.boxes(items)

        if isinstance(result, dict) and "quad_boxes" in result and "labels" in result:
            W, H = img.width, img.height
            items = []
            for quad, lab in zip(result["quad_boxes"], result["labels"]):
                xs = quad[0::2]; ys = quad[1::2]
                x1, y1, x2, y2 = min(xs), min(ys), max(xs), max(ys)
                items.append({
                    "label": lab, "score": 1.0,
                    "box": [x1 / W, y1 / H, (x2 - x1) / W, (y2 - y1) / H],
                })
            return ok.boxes(items)

        return ok.text(result if isinstance(result, str) else str(result))
