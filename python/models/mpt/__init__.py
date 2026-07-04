"""MPT. MosaicML's open-source LM."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["mpt"]
TASK = "text-generation"
ADAPTER = make_pipeline_adapter("text-generation", name="MptAdapter")
