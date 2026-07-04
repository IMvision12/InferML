"""FLUX family. Black Forest Labs' rectified flow transformer.

FLUX-schnell is CFG-distilled and runs in 4 steps with no guidance.
FLUX-dev is the full-quality variant: ~28 steps, guidance ~3.5.
The defaults here target schnell since it's the smaller / more accessible
checkpoint; dev users can override `num_inference_steps` and
`guidance_scale` per call.
"""
from models._diffusion_helper import DiffusionFamilyAdapter


class FluxAdapter(DiffusionFamilyAdapter):
    DEFAULT_STEPS = 4
    DEFAULT_GUIDANCE = 0.0


LIBRARY = "diffusers"
TASK = "text-to-image"
REPO_PATTERNS = [
    "black-forest-labs/flux*",
    "black-forest-labs/flux.1*",
    "*/flux*",                      # community forks
]
ADAPTER = FluxAdapter
