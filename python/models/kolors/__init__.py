"""Kolors. Kuaishou's text-to-image diffusion."""
from models._diffusion_helper import DiffusionFamilyAdapter


class KolorsAdapter(DiffusionFamilyAdapter):
    DEFAULT_STEPS = 50
    DEFAULT_GUIDANCE = 5.0


LIBRARY = "diffusers"
TASK = "text-to-image"
REPO_PATTERNS = [
    "kwai-kolors/kolors*",
]
ADAPTER = KolorsAdapter
