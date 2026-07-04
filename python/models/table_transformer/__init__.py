"""Table Transformer. DETR fine-tuned for table detection / structure recognition."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["table-transformer", "table_transformer"]
TASK = "object-detection"
ADAPTER = make_pipeline_adapter("object-detection", name="TableTransformerAdapter")
