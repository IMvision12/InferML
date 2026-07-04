"""SDXL-Turbo + SD-Turbo. CFG-distilled fast variants. 1-4 steps, no guidance."""
from models._diffusion_helper import DiffusionFamilyAdapter


class SDXLTurboAdapter(DiffusionFamilyAdapter):
    DEFAULT_STEPS = 1
    DEFAULT_GUIDANCE = 0.0


LIBRARY = "diffusers"
TASK = "text-to-image"
REPO_PATTERNS = [
    "stabilityai/sdxl-turbo*",
    "stabilityai/sd-turbo*",
]
ADAPTER = SDXLTurboAdapter
