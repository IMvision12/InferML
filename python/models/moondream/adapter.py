"""Moondream family. Tiny VLMs that use a custom `answer_question` API."""
from __future__ import annotations

from adapters.base import Adapter
import output_kinds as ok
from io_utils import decode_image, resolve_device

_TRUSTED_MOONDREAM_OWNERS = {"vikhyatk", "moondream"}

class MoondreamAdapter(Adapter):
    @classmethod
    def can_handle(cls, info):
        mid = (info.get("model_id") or "").lower()
        mt = (info.get("model_type") or "").lower()
        return "moondream" in mid or mt.startswith("moondream")

    def load(self, info, device):
        from transformers import AutoModelForCausalLM, AutoTokenizer
        self.info = info
        owner = (info.get("model_id") or "").split("/")[0].lower()
        trust_default = owner in _TRUSTED_MOONDREAM_OWNERS
        trust = bool(self.override.get("trust_remote_code", trust_default))
        self.tokenizer = AutoTokenizer.from_pretrained(info["model_id"], trust_remote_code=trust)
        self.model = AutoModelForCausalLM.from_pretrained(info["model_id"], trust_remote_code=trust)
        dev = resolve_device()
        if dev is not False:
            self.model = self.model.to(dev)
        self.model.eval()

    def run(self, inputs, params):
        if not inputs.get("dataUrl"):
            raise ValueError("Moondream needs an image")
        img = decode_image(inputs["dataUrl"])
        question = (inputs.get("text") or "").strip() or "Describe this image in detail."
        enc = self.model.encode_image(img)
        answer = self.model.answer_question(enc, question, self.tokenizer)
        return ok.text(answer)
