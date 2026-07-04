"""EdgeTAM. Lightweight SAM variant for fast segmentation + tracking.

Registered in transformers as `edgetam` and `edgetam_video`. Most existing
HF repos (`facebook/EdgeTAM`, ONNX forks, vendor-specific ports) declare
non-transformers `library_name` and may NOT surface in the Hub. A
transformers-canonical EdgeTAM repo (e.g. `yonigozlan/EdgeTAM-hf` once
the config matures) will surface and load through the standard
mask-generation pipeline.
"""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["edgetam", "edgetam_video"]
TASK = "mask-generation"
ADAPTER = make_pipeline_adapter("mask-generation", name="EdgeTamAdapter")
