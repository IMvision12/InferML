"""Task handler + variant ABCs.

A TaskHandler owns everything about executing one *task* (e.g. object-detection).
Each task declares one or more Variants — different ways to invoke models for
that task. The handler's `pick_variant` routes by inspecting the model metadata
and the caller's inputs.

To add support for a new model shape in an existing task:
  1. Add a Variant subclass in tasks/<task>.py
  2. Implement its `can_handle(info, inputs)` and `run(...)` methods
  3. Append it to the task's `variants` list (most specific first)

To add a brand-new task:
  1. Create tasks/<task>.py with a TaskHandler subclass
  2. Register it in tasks/__init__.py's TASK_REGISTRY
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Callable


@dataclass
class LoadedPipeline:
    """Everything a variant might want to reuse across calls."""
    info: dict
    device: Any
    pipe: Any = None          # HF pipeline instance (nullable — variants may bypass it)
    model: Any = None         # raw model, for variants that need direct .generate()
    processor: Any = None     # processor/tokenizer/image_processor


class TaskVariant(ABC):
    """One way to run a task. The handler tries variants in order; first
    `can_handle` match wins."""
    name: str = "unnamed"

    def can_handle(self, info: dict, inputs: dict) -> bool:  # pragma: no cover
        return False

    @abstractmethod
    def run(self, state: LoadedPipeline, inputs: dict, params: dict) -> dict:
        """Produce a dict matching the task's declared output kind."""


class TaskHandler(ABC):
    """One per task family (object-detection, image-segmentation, ...)."""

    # Required:
    name: str                           # e.g. "object-detection"
    output_kind: str                    # one of the kinds in output_kinds.py
    variants: list[TaskVariant]         # tried in order
    default_params: dict                # merged with request params

    # Pipeline task name to pass to transformers.pipeline(...). Falls back to
    # `name`. Subclasses override when the HF task name differs.
    def runtime_task(self) -> str:
        return getattr(self, "_runtime_task", self.name)

    def pick_variant(self, info: dict, inputs: dict) -> TaskVariant:
        for v in self.variants:
            try:
                if v.can_handle(info, inputs):
                    return v
            except Exception:
                # A variant's can_handle should not raise; if it does, skip it.
                continue
        raise RuntimeError(f"No variant of {self.name!r} accepted inputs={list(inputs)} model={info.get('model_id')}")

    def merge_params(self, params: dict) -> dict:
        merged = dict(self.default_params)
        merged.update(params or {})
        return merged

    def load_pipeline(self, info: dict, device: Any, extra_kwargs: dict | None = None) -> LoadedPipeline:
        """Default loader — use `transformers.pipeline()`. Override when a task
        wants a different load strategy."""
        from transformers import pipeline as hf_pipeline
        from io_utils import pipeline_device_arg
        kwargs = dict(extra_kwargs or {})
        pipe = hf_pipeline(self.runtime_task(), model=info["model_id"], device=pipeline_device_arg(), **kwargs)
        return LoadedPipeline(
            info=info,
            device=device,
            pipe=pipe,
            model=getattr(pipe, "model", None),
            processor=getattr(pipe, "processor", None) or getattr(pipe, "image_processor", None) or getattr(pipe, "tokenizer", None),
        )

    def handle(self, state: LoadedPipeline, inputs: dict, params: dict) -> dict:
        merged = self.merge_params(params)
        variant = self.pick_variant(state.info, inputs)
        out = variant.run(state, inputs, merged)
        if out.get("kind") != self.output_kind:
            raise RuntimeError(
                f"{type(variant).__name__} returned kind={out.get('kind')!r} "
                f"but {self.name} expects {self.output_kind!r}"
            )
        return out
