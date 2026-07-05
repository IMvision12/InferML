"""Donut. Document Understanding Transformer (no OCR pre-step).

Used for both image-to-text captioning and document-question-answering.
The repo's `pipeline_tag` decides which task handler picks it up.
"""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["donut-swin", "donut_swin"]
TASK = "image-to-text"
EXTRA_TASKS = ["document-question-answering"]
ADAPTER = make_pipeline_adapter("image-to-text", name="DonutAdapter")
