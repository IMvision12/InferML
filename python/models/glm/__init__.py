"""GLM family. THUDM. Includes GLM, GLM-4, and the GLM-MoE-DSA variant."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["glm", "glm4", "glm_moe_dsa"]
TASK = "text-generation"
ADAPTER = make_pipeline_adapter("text-generation", name="GlmAdapter")
