"""Per-family diffusers adapter base.

Subclass this in a family folder to set per-family inference defaults
(num_inference_steps, guidance_scale) without rewriting the load + run
logic. The base behavior is identical to `adapters.diffusers_pipeline.DiffusersAdapter`
otherwise.

Example:

    # models/flux/__init__.py
    from models._diffusion_helper import DiffusionFamilyAdapter

    class FluxAdapter(DiffusionFamilyAdapter):
        # FLUX-schnell is CFG-distilled. 4 steps, no guidance.
        # FLUX-dev wants ~28 steps + guidance ~3.5. Override per call via params.
        DEFAULT_STEPS = 4
        DEFAULT_GUIDANCE = 0.0

    LIBRARY = "diffusers"
    REPO_PATTERNS = ["black-forest-labs/flux*", "*/flux*"]
    ADAPTER = FluxAdapter
"""
from __future__ import annotations

from adapters.diffusers_pipeline import DiffusersAdapter


class DiffusionFamilyAdapter(DiffusersAdapter):
    """DiffusersAdapter with per-family inference defaults.

    Override `DEFAULT_STEPS` and `DEFAULT_GUIDANCE` (and optionally
    `DEFAULT_NEGATIVE_PROMPT`) on the subclass. user-provided params still
    win on conflict.
    """
    DEFAULT_STEPS: int = 20
    DEFAULT_GUIDANCE: float = 7.5
    DEFAULT_NEGATIVE_PROMPT: str | None = None

    def run(self, inputs, params):
        merged = dict(params or {})
        merged.setdefault("num_inference_steps", self.DEFAULT_STEPS)
        merged.setdefault("guidance_scale", self.DEFAULT_GUIDANCE)
        if self.DEFAULT_NEGATIVE_PROMPT and "negative_prompt" not in merged:
            merged["negative_prompt"] = self.DEFAULT_NEGATIVE_PROMPT
        return super().run(inputs, merged)
