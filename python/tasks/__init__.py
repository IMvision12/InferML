"""Task registry.

Each entry maps an HF pipeline_tag → a TaskHandler instance. Call site:

    from tasks import get_task
    handler = get_task("object-detection")
    state = handler.load_pipeline(info, device)
    result = handler.handle(state, inputs, params)

To add a new task: create a file, add its class to the imports below, register
it in TASK_REGISTRY."""
from __future__ import annotations

from .base import TaskHandler, TaskVariant, LoadedPipeline

from .object_detection import ObjectDetectionTask, ZeroShotObjectDetectionTask
from .image_segmentation import ImageSegmentationTask
from .mask_generation import MaskGenerationTask
from .image_classification import ImageClassificationTask, ZeroShotImageClassificationTask
from .image_to_text import ImageToTextTask, ImageTextToTextTask
from .depth_estimation import DepthEstimationTask
from .document_qa import DocumentQATask
from .asr import ASRTask
from .text_generation import (
    TextGenerationTask, TranslationTask, SummarizationTask,
)
from .misc_tasks import TextToSpeechTask
from .feature_extraction import FeatureExtractionTask, SentenceSimilarityTask


def _registry():
    tasks = [
        ObjectDetectionTask(),
        ZeroShotObjectDetectionTask(),
        ImageSegmentationTask(),
        MaskGenerationTask(),
        ImageClassificationTask(),
        ZeroShotImageClassificationTask(),
        ImageToTextTask(),
        ImageTextToTextTask(),
        DepthEstimationTask(),
        DocumentQATask(),
        ASRTask(),
        TextGenerationTask(),
        TranslationTask(),
        SummarizationTask(),
        TextToSpeechTask(),
        FeatureExtractionTask(),
        SentenceSimilarityTask(),
    ]
    return {t.name: t for t in tasks}


TASK_REGISTRY = _registry()


def get_task(task_name: str) -> TaskHandler | None:
    return TASK_REGISTRY.get(task_name)


__all__ = [
    "TASK_REGISTRY", "get_task",
    "TaskHandler", "TaskVariant", "LoadedPipeline",
]
