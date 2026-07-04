"""GLM4V. THUDM vision-language model. Includes the MoE variant."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["glm4v", "glm4v_moe"]
TASK = "image-text-to-text"
ADAPTER = make_pipeline_adapter("image-text-to-text", name="Glm4VAdapter")
