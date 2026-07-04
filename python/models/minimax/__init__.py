"""MiniMax. MiniMax + MiniMax-M2 + MiMo (XiaomiMiMo)."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["minimax", "minimax_m2", "mimo"]
TASK = "text-generation"
ADAPTER = make_pipeline_adapter("text-generation", name="MiniMaxAdapter")
