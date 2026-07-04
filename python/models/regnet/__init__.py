"""RegNet. Facebook's regular network architecture."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["regnet"]
TASK = "image-classification"
ADAPTER = make_pipeline_adapter("image-classification", name="RegNetAdapter")
