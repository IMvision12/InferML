"""Vision-Encoder-Decoder. Generic encoder-decoder pairing (e.g., ViT-GPT2 captioner)."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["vision-encoder-decoder", "vision_encoder_decoder"]
TASK = "image-to-text"
EXTRA_TASKS = ["document-question-answering"]
ADAPTER = make_pipeline_adapter("image-to-text", name="VisionEncoderDecoderAdapter")
