"""Gemma text-only LLM family. Gemma, Gemma2, Gemma3 (text), Gemma 3n.

Multimodal Gemma (gemma3 with image input) is treated as a VLM and routes
through standard image-text-to-text inference.
"""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["gemma", "gemma2", "gemma3_text", "gemma3n", "recurrent_gemma"]
TASK = "text-generation"
ADAPTER = make_pipeline_adapter("text-generation", name="GemmaAdapter")
