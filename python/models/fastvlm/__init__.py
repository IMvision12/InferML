from .adapter import FastVLMAdapter

# Apple's FastVLM-0.5B / 1.5B / 7B all use model_type=llava_qwen2 in their
# config, but they ship under library_name=ml-fastvlm and require the
# custom image-token splice (input_ids contains a -200 sentinel where the
# image goes). LlavaAdapter would mis-handle them, so this family wins
# routing first via the registry.
MODEL_TYPES = ["llava_qwen2"]
TASK = "image-text-to-text"
ADAPTER = FastVLMAdapter
