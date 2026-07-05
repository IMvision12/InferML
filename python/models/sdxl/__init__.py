"""SDXL family. SDXL base, SDXL-Turbo, SD-Turbo.

Refiner is a separate img2img model in models/sdxl_refiner/.
"""
from models._diffusion_helper import DiffusionFamilyAdapter

class SDXLAdapter(DiffusionFamilyAdapter):
    DEFAULT_STEPS = 30
    DEFAULT_GUIDANCE = 7.0

class SDXLTurboAdapter(DiffusionFamilyAdapter):
    DEFAULT_STEPS = 1
    DEFAULT_GUIDANCE = 0.0

def _adapter_factory(info=None):
    return SDXLAdapter()

LIBRARY = "diffusers"
TASK = "text-to-image"
REPO_PATTERNS = [
    "stabilityai/stable-diffusion-xl-base-*",
    "stabilityai/stable-diffusion-xl-1*",
    "stabilityai/sdxl-vae*",
]
ADAPTER = SDXLAdapter
