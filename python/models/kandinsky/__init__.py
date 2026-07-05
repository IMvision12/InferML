"""Kandinsky family. v2.2 + v3."""
from models._diffusion_helper import DiffusionFamilyAdapter

class KandinskyAdapter(DiffusionFamilyAdapter):
    DEFAULT_STEPS = 50
    DEFAULT_GUIDANCE = 4.0

LIBRARY = "diffusers"
TASK = "text-to-image"
REPO_PATTERNS = [
    "kandinsky-community/kandinsky-*",
    "ai-forever/kandinsky*",
]
ADAPTER = KandinskyAdapter
