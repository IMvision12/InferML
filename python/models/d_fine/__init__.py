"""D-FINE. Real-time detector with fine-grained box refinement."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["d_fine"]
TASK = "object-detection"
ADAPTER = make_pipeline_adapter("object-detection", name="DFineAdapter")
