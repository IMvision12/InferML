"""SDXL Refiner. Two-stage img2img refinement after SDXL base.

Routes through `pipeline_tag: image-to-image`. Needs an init image input.
"""
from models._diffusion_helper import DiffusionFamilyAdapter


class SDXLRefinerAdapter(DiffusionFamilyAdapter):
    DEFAULT_STEPS = 25
    DEFAULT_GUIDANCE = 7.5


LIBRARY = "diffusers"
TASK = "image-to-image"
REPO_PATTERNS = [
    "stabilityai/stable-diffusion-xl-refiner*",
]
ADAPTER = SDXLRefinerAdapter
