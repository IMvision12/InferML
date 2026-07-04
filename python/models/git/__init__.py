"""GIT. Microsoft's Generative Image-to-text Transformer."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["git"]
TASK = "image-to-text"
ADAPTER = make_pipeline_adapter("image-to-text", name="GitAdapter")
