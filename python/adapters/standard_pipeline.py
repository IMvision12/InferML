"""Standard HF pipeline adapter. Fallback when no `models/<family>/` matches.

Thin dispatcher: the actual per-task logic lives in `python/tasks/`. When a
model breaks, add a folder under `python/models/` (preferred) or a Variant
in the relevant task file.
"""
from __future__ import annotations

from .base import Adapter
from tasks import TASK_REGISTRY, get_task


class StandardPipelineAdapter(Adapter):
    SUPPORTED_TASKS = set(TASK_REGISTRY.keys())

    @classmethod
    def can_handle(cls, info):
        return info.get("pipeline_tag") in cls.SUPPORTED_TASKS

    def load(self, info, device):
        self.info = info
        self.device = device
        self.task_name = info["pipeline_tag"]
        self.handler = get_task(self.task_name)
        if self.handler is None:
            raise ValueError(f"No task handler registered for {self.task_name!r}")
        extra = {"trust_remote_code": True} if self.override.get("trust_remote_code") else {}
        self.state = self.handler.load_pipeline(info, device, extra_kwargs=extra)

    def run(self, inputs, params):
        return self.handler.handle(self.state, inputs, params)
