"""GPT-2 + descendants. GPT-2, GPT-Neo, GPT-NeoX, GPT-J, GPT-BigCode."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["gpt2", "gpt_neo", "gpt_neox", "gptj", "gpt_bigcode"]
TASK = "text-generation"
ADAPTER = make_pipeline_adapter("text-generation", name="Gpt2Adapter")
