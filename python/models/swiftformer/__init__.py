"""SwiftFormer. Efficient additive attention transformer."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["swiftformer"]
TASK = "image-classification"
ADAPTER = make_pipeline_adapter("image-classification", name="SwiftFormerAdapter")
