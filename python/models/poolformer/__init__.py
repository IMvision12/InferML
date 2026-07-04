"""PoolFormer. MetaFormer with pooling instead of attention."""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["poolformer"]
TASK = "image-classification"
ADAPTER = make_pipeline_adapter("image-classification", name="PoolFormerAdapter")
