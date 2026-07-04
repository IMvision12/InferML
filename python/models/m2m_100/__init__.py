"""M2M-100. Many-to-many multilingual translation. Plus NLLB-MoE and FSMT."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["m2m_100", "nllb-moe", "nllb_moe", "fsmt"]
TASK = "translation"
ADAPTER = make_pipeline_adapter("translation", name="M2M100Adapter")
