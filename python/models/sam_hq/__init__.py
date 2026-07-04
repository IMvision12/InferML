"""SAM-HQ. Higher-quality SAM with sharper boundary masks.

Same SAM workspace (auto grid-sampling + interactive point/box prompting).
Smallest canonical checkpoint: `syscv-community/sam-hq-vit-base`.
"""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["sam_hq"]
TASK = "mask-generation"
ADAPTER = make_pipeline_adapter("mask-generation", name="SamHqAdapter")
