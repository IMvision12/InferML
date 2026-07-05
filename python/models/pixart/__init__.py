"""PixArt-α + PixArt-Σ. Diffusion transformers from PixArt-alpha."""
from models._diffusion_helper import DiffusionFamilyAdapter

class PixArtAdapter(DiffusionFamilyAdapter):
    DEFAULT_STEPS = 20
    DEFAULT_GUIDANCE = 4.5

LIBRARY = "diffusers"
TASK = "text-to-image"
REPO_PATTERNS = [
    "pixart-alpha/pixart-*",
    "pixart-alpha/pixart_sigma*",
]
ADAPTER = PixArtAdapter
