from .adapter import LlavaAdapter

# Includes: classic LLaVA, LLaVA-Next (1.6), LLaVA-OneVision, LLaVA-Next-Video,
# ViP-LLaVA. Mistral's Pixtral-12B also uses model_type=llava under the hood.
MODEL_TYPES = ["llava", "llava_next", "llava_next_video", "llava_onevision", "vipllava"]
TASK = "image-text-to-text"
ADAPTER = LlavaAdapter
