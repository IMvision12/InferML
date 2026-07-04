"""Playground (v2 + v2.5). SDXL-architecture diffusion fine-tuned by Playground AI."""
from models._diffusion_helper import DiffusionFamilyAdapter


class PlaygroundAdapter(DiffusionFamilyAdapter):
    DEFAULT_STEPS = 30
    DEFAULT_GUIDANCE = 3.0    # Playground 2.5 was tuned for lower CFG


LIBRARY = "diffusers"
TASK = "text-to-image"
REPO_PATTERNS = [
    "playgroundai/playground-*",
    "playgroundai/playground_v*",
]
ADAPTER = PlaygroundAdapter
