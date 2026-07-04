"""SD inpainting variants. SD 1.5, SD 2.0, SDXL inpainting checkpoints.

Needs an image + mask. The mask input would arrive on `inputs.maskDataUrl`
once the UI exposes a mask editor; without that the runtime errors out
politely.
"""
from models._diffusion_helper import DiffusionFamilyAdapter


class SDInpaintingAdapter(DiffusionFamilyAdapter):
    DEFAULT_STEPS = 30
    DEFAULT_GUIDANCE = 7.5


LIBRARY = "diffusers"
TASK = "inpainting"
REPO_PATTERNS = [
    "runwayml/stable-diffusion-inpainting*",
    "stabilityai/stable-diffusion-2-inpainting*",
    "stabilityai/stable-diffusion-xl-inpainting*",
    "diffusers/stable-diffusion-xl-1.0-inpainting*",
]
ADAPTER = SDInpaintingAdapter
