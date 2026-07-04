"""Thin adapter that delegates inference to a shared task handler.

Many model families (DETR, RT-DETR, SAM, SegFormer, ...) share the same
inference + post-processing path. They differ only in model_type tags. To
avoid duplicating the full pipeline + post-processing dance in every
`models/<family>/adapter.py`, those folders use this helper:

    from models._pipeline_helper import make_pipeline_adapter
    ADAPTER = make_pipeline_adapter("object-detection")

A family that needs a quirk (different default threshold, custom kwargs,
extra post-processing) can sub-class `PipelineAdapter` directly and override
`run()` or `load()` without touching siblings.
"""
from __future__ import annotations

from adapters.base import Adapter


class PipelineAdapter(Adapter):
    """Delegates to the shared task handler in `python/tasks/<task>.py`.

    `TASK_NAME` is the family's primary task (used as a fallback). At runtime
    the adapter prefers the repo's `pipeline_tag` so a model_type that spans
    multiple tasks (BEiT does both image-classification and image-segmentation;
    Donut does both image-to-text and document-question-answering) routes to
    the right handler regardless of which family folder claims it.
    """
    TASK_NAME: str = ""

    def load(self, info, device):
        from tasks import get_task
        self.info = info
        # Prefer pipeline_tag if it points at a task we know. Falls back to
        # the family's primary task if the tag is missing or unknown.
        task_name = info.get("pipeline_tag") or ""
        if get_task(task_name) is None:
            task_name = self.TASK_NAME
        if not task_name:
            raise ValueError(f"{type(self).__name__}: no task to dispatch on")
        self._task = get_task(task_name)
        if self._task is None:
            raise ValueError(f"No task handler for {task_name!r}")
        extra = {"trust_remote_code": True} if self.override.get("trust_remote_code") else {}
        self._state = self._task.load_pipeline(info, device, extra_kwargs=extra)

    def run(self, inputs, params):
        return self._task.handle(self._state, inputs, params)


def make_pipeline_adapter(task_name: str, *, name: str | None = None) -> type:
    """Factory: returns a PipelineAdapter subclass bound to `task_name`."""
    cls_name = name or f"{task_name.replace('-', '_').title().replace('_', '')}Adapter"
    return type(cls_name, (PipelineAdapter,), {"TASK_NAME": task_name})
