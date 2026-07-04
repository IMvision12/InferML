"""UperNet. Unified perceptual parsing for scene understanding."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["upernet"]
TASK = "image-segmentation"
ADAPTER = make_pipeline_adapter("image-segmentation", name="UperNetAdapter")
