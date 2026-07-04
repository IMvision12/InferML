"""InternVL family. OpenGVLab's open VLM."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["internvl", "internvl_chat"]
TASK = "image-text-to-text"
ADAPTER = make_pipeline_adapter("image-text-to-text", name="InternVlAdapter")
