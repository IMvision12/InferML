"""DeepSeek text LLM family. V1, V2, V3 (incl. R1-distill)."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["deepseek", "deepseek_v2", "deepseek_v3"]
TASK = "text-generation"
ADAPTER = make_pipeline_adapter("text-generation", name="DeepSeekAdapter")
