"""MGP-STR. Multi-Granularity Prediction for Scene Text Recognition.

Canonical model_type is `mgp-str` with a hyphen (transformers' `MgpstrConfig`).
Smallest checkpoint: `alibaba-damo/mgp-str-base`. Reads a cropped text line
from an image and returns the recognized string. Useful as a TrOCR alternative
on natural-scene text (signs, billboards, scanned documents).
"""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["mgp-str", "mgp_str"]
TASK = "image-to-text"
ADAPTER = make_pipeline_adapter("image-to-text", name="MgpStrAdapter")
