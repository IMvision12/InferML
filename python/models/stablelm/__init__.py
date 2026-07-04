"""StableLM. Stability AI's open language model series."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["stablelm"]
TASK = "text-generation"
ADAPTER = make_pipeline_adapter("text-generation", name="StableLmAdapter")
