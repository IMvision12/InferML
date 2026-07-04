"""GOT-OCR 2.0. Stepfun's general-purpose OCR (formula, table, plain, polygon).

transformers ships native support as `got_ocr2` →
`GotOcr2ForConditionalGeneration` in the image-text-to-text auto-class.

Caveats:
- The original `stepfun-ai/GOT-OCR2_0` repo declares `model_type: "GOT"`
  (not `got_ocr2`) and `library_name: null`. We accept both spellings in
  MODEL_TYPES; library=None passes our filter. The repo also has a
  `custom_code` tag, so it needs `trust_remote_code: true` (set up via
  model_overrides.json).
- Newer transformers-native uploads will use the canonical `got_ocr2`
  model_type and load through the standard pipeline path without any
  override needed.
"""
from models._pipeline_helper import make_pipeline_adapter

MODEL_TYPES = ["got_ocr2", "got"]
TASK = "image-text-to-text"
ADAPTER = make_pipeline_adapter("image-text-to-text", name="GotOcr2Adapter")
