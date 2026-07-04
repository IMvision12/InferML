"""InstructPix2Pix. Diffusion-based instruction-following image editor.

Routes through `pipeline_tag: image-to-image`. Takes an init image + an
edit instruction (`Make it a winter scene`).
"""
from models._diffusion_helper import DiffusionFamilyAdapter


class InstructPix2PixAdapter(DiffusionFamilyAdapter):
    DEFAULT_STEPS = 50
    DEFAULT_GUIDANCE = 7.5


LIBRARY = "diffusers"
TASK = "image-to-image"
REPO_PATTERNS = [
    "timbrooks/instruct-pix2pix*",
]
ADAPTER = InstructPix2PixAdapter
