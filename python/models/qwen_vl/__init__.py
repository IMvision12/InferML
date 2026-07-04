from .adapter import QwenVLAdapter

# Qwen-VL series, including Qwen2-VL, Qwen2.5-VL, Qwen3-VL, Qwen3.5/3.6 VLM variants.
# Kimi (Moonshot) is in models/kimi_vl/, not here. it's not Qwen.
MODEL_TYPES = ["qwen2_vl", "qwen2_5_vl", "qwen3_vl", "qwen3_5", "qwen3_5_moe", "qwen3_6"]
TASK = "image-text-to-text"
ADAPTER = QwenVLAdapter
