"""Sana. NVIDIA's efficient linear-attention DiT."""
from models._diffusion_helper import DiffusionFamilyAdapter


class SanaAdapter(DiffusionFamilyAdapter):
    DEFAULT_STEPS = 20
    DEFAULT_GUIDANCE = 4.5


LIBRARY = "diffusers"
TASK = "text-to-image"
REPO_PATTERNS = [
    "efficient-large-model/sana_*",
    "efficient-large-model/sana-*",
]
ADAPTER = SanaAdapter
