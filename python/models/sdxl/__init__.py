"""SDXL family. SDXL base, SDXL-Turbo, SD-Turbo.

Refiner is a separate img2img model in models/sdxl_refiner/.
"""
from models._diffusion_helper import DiffusionFamilyAdapter


class SDXLAdapter(DiffusionFamilyAdapter):
    DEFAULT_STEPS = 30
    DEFAULT_GUIDANCE = 7.0    # SDXL is a touch lower than SD 1.5


class SDXLTurboAdapter(DiffusionFamilyAdapter):
    DEFAULT_STEPS = 1         # SDXL-Turbo / SD-Turbo are 1-4 step distilled
    DEFAULT_GUIDANCE = 0.0    # turbo variants don't use CFG


def _adapter_factory(info=None):
    return SDXLAdapter()


# Two patterns -> two adapters. We use the more specific (turbo) match first
# via routing precedence on the LIBRARY_REGISTRY iteration order: declare a
# separate folder for turbo if you want it isolated.
LIBRARY = "diffusers"
TASK = "text-to-image"
REPO_PATTERNS = [
    "stabilityai/stable-diffusion-xl-base-*",
    "stabilityai/stable-diffusion-xl-1*",
    "stabilityai/sdxl-vae*",
]
ADAPTER = SDXLAdapter
