"""Kosmos family. Microsoft Kosmos-2 / Kosmos-2.5."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["kosmos-2", "kosmos_2", "kosmos-2.5", "kosmos_2_5"]
TASK = "image-text-to-text"
ADAPTER = make_pipeline_adapter("image-text-to-text", name="KosmosAdapter")
