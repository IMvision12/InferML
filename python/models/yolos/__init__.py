"""YOLOS. Transformer-native YOLO. Not to be confused with Ultralytics YOLO."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["yolos"]
TASK = "object-detection"
ADAPTER = make_pipeline_adapter("object-detection", name="YolosAdapter")
