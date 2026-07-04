from .adapter import DeepSeekVLAdapter

# DeepSeek-VL v1 (community fork). 1.3B uses model_type=deepseek_vl,
# 7B uses model_type=deepseek_vl_hybrid. v2 (deepseek_vl_v2) is not yet
# in transformers' auto-config registry.
MODEL_TYPES = ["deepseek_vl", "deepseek_vl_hybrid"]
TASK = "image-text-to-text"
ADAPTER = DeepSeekVLAdapter
