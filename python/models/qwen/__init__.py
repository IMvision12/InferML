"""Qwen text-only LLM family. Qwen2, Qwen2-MoE, Qwen3, Qwen3-MoE.

Vision-language siblings (Qwen-VL etc.) live in models/qwen_vl/.
"""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["qwen2", "qwen2_moe", "qwen3", "qwen3_moe"]
TASK = "text-generation"
ADAPTER = make_pipeline_adapter("text-generation", name="QwenAdapter")
