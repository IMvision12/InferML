"""Stable Diffusion family. SD 1.5 / 2.x / 3 / 3.5 (text-to-image).

Inpainting variants live in models/sd_inpainting/. Img2img refiner lives in
models/sdxl_refiner/. SDXL is its own family in models/sdxl/.
"""
from models._diffusion_helper import DiffusionFamilyAdapter


class StableDiffusionAdapter(DiffusionFamilyAdapter):
    DEFAULT_STEPS = 30        # SD 1.5 / 2.x sweet spot
    DEFAULT_GUIDANCE = 7.5    # canonical CFG


LIBRARY = "diffusers"
TASK = "text-to-image"
REPO_PATTERNS = [
    "runwayml/stable-diffusion-*",
    "stabilityai/stable-diffusion-2*",
    "stabilityai/stable-diffusion-3*",
    "stabilityai/stable-diffusion-3.5*",
    "stabilityai/sd-3*",
    "compvis/stable-diffusion*",
]
ADAPTER = StableDiffusionAdapter
