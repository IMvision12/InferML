"""GPT-OSS. OpenAI's 20B open-weights model."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["gpt_oss"]
TASK = "text-generation"
ADAPTER = make_pipeline_adapter("text-generation", name="GptOssAdapter")
