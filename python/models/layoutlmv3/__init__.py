"""LayoutLMv3. Document understanding with self-supervised text + layout pretraining.

Self-contained (no Tesseract or detectron2 required, unlike v1/v2).
"""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["layoutlmv3"]
TASK = "document-question-answering"
ADAPTER = make_pipeline_adapter("document-question-answering", name="LayoutLMv3Adapter")
