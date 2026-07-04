"""ProphetNet. Sequence-to-sequence summarization."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["prophetnet"]
TASK = "summarization"
ADAPTER = make_pipeline_adapter("summarization", name="ProphetNetAdapter")
