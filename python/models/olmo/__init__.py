"""OLMo family. Allen AI open LMs. OLMo, OLMo2, OLMo3, OLMoE."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["olmo", "olmo2", "olmo3", "olmoe"]
TASK = "text-generation"
ADAPTER = make_pipeline_adapter("text-generation", name="OlmoAdapter")
