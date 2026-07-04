"""Data2Vec-Vision. Self-supervised pretraining for vision (segmentation head)."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["data2vec-vision", "data2vec_vision"]
TASK = "image-segmentation"
ADAPTER = make_pipeline_adapter("image-segmentation", name="Data2VecVisionAdapter")
