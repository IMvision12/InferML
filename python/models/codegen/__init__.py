"""CodeGen. Salesforce's code-generation transformer."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["codegen"]
TASK = "text-generation"
ADAPTER = make_pipeline_adapter("text-generation", name="CodeGenAdapter")
