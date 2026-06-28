from __future__ import annotations

import sys
import time
from collections.abc import Mapping
from importlib.metadata import version
from typing import Any
from uuid import uuid4

from graphon.dsl import inspect
from graphon.dsl.entities import DslCredentials, LoadStatus
from graphon.dsl.importer import _build_variable_pool, _select_root_node_id
from graphon.dsl.node_factory import SlimDslNodeFactory
from graphon.entities.graph_init_params import GraphInitParams
from graphon.graph.graph import Graph
from graphon.graph_engine.command_channels import InMemoryChannel
from graphon.graph_engine.graph_engine import GraphEngine
from graphon.graph_events.graph import (
    GraphRunAbortedEvent,
    GraphRunFailedEvent,
    GraphRunPartialSucceededEvent,
    GraphRunPausedEvent,
    GraphRunSucceededEvent,
)
from graphon.graph_events.node import (
    NodeRunExceptionEvent,
    NodeRunFailedEvent,
    NodeRunStartedEvent,
    NodeRunSucceededEvent,
)
from graphon.runtime.graph_runtime_state import GraphRuntimeState

from .http_llm import HttpProfileLLM


class StudioNodeFactory(SlimDslNodeFactory):
    def __init__(self, *args: Any, profile: Mapping[str, Any] | None, **kwargs: Any):
        super().__init__(*args, **kwargs)
        self._studio_profile = dict(profile or {})

    def _create_slim_llm_runtime(
        self,
        *,
        node_id: str,
        data: Mapping[str, Any],
        node_type_label: str,
    ) -> tuple[dict[str, Any], HttpProfileLLM]:
        if not self._studio_profile:
            raise RuntimeError(
                f"{node_type_label} node {node_id} requires a selected AI profile."
            )
        normalized = dict(data)
        model = dict(normalized.get("model") or {})
        model_name = str(self._studio_profile.get("model") or model.get("name") or "")
        if not model_name:
            raise RuntimeError(f"{node_type_label} node {node_id} has no model name.")
        model["provider"] = str(self._studio_profile.get("type") or model.get("provider") or "")
        model["name"] = model_name
        normalized["model"] = model
        return normalized, HttpProfileLLM(
            profile=self._studio_profile,
            model_name=model_name,
            parameters=model.get("completion_params") or {},
        )


def runtime_status() -> dict[str, Any]:
    return {
        "available": True,
        "engine": "graphon",
        "engineVersion": version("graphon"),
        "pythonVersion": sys.version.split()[0],
        "supportedPython": ">=3.12,<3.14",
    }


def inspect_dsl(dsl: str) -> dict[str, Any]:
    plan = inspect(dsl)
    return {
        "loadable": plan.load_status == LoadStatus.LOADABLE,
        "status": plan.load_status.value,
        "reason": plan.load_reason,
        "kind": plan.document.kind.value,
        "dependencies": [item.model_dump(mode="json") for item in plan.dependencies],
    }


def _load_engine(
    *,
    dsl: str,
    inputs: Mapping[str, Any],
    profile: Mapping[str, Any] | None,
    workflow_id: str,
) -> GraphEngine:
    plan = inspect(dsl)
    if plan.load_status != LoadStatus.LOADABLE:
        raise RuntimeError(plan.load_reason or f"DSL is {plan.load_status.value}.")
    graph_config = plan.document.graph_config
    if graph_config is None:
        raise RuntimeError("DSL does not contain an executable graph.")

    root_id = _select_root_node_id(graph_config)
    normalized_inputs = dict(inputs)
    root_node = next(
        (
            node
            for node in graph_config.get("nodes", [])
            if str(node.get("id")) == root_id
        ),
        None,
    )
    variables = (
        root_node.get("data", {}).get("variables", [])
        if isinstance(root_node, Mapping)
        else []
    )
    variable_names = [
        str(variable.get("variable"))
        for variable in variables
        if isinstance(variable, Mapping) and variable.get("variable")
    ]
    missing_names = [
        name for name in variable_names if name not in normalized_inputs
    ]
    if len(variable_names) == 1 and len(missing_names) == 1:
        alias_value = normalized_inputs.get("input", normalized_inputs.get("query"))
        if alias_value is not None:
            normalized_inputs[missing_names[0]] = alias_value

    variable_pool = _build_variable_pool(
        runtime_variables=plan.document.runtime_variables,
        root_node_id=root_id,
        run_context={},
        start_inputs=normalized_inputs,
    )
    init_params = GraphInitParams(
        workflow_id=workflow_id,
        graph_config=graph_config,
        run_context={},
        call_depth=0,
    )
    runtime_state = GraphRuntimeState(variable_pool=variable_pool, start_at=time.time())
    factory = StudioNodeFactory(
        graph_config=graph_config,
        graph_init_params=init_params,
        graph_runtime_state=runtime_state,
        credentials=DslCredentials(),
        dependencies=list(plan.dependencies),
        profile=profile,
    )
    graph = Graph.init(
        graph_config=graph_config,
        node_factory=factory,
        root_node_id=root_id,
    )
    return GraphEngine(
        workflow_id=workflow_id,
        graph=graph,
        graph_runtime_state=runtime_state,
        command_channel=InMemoryChannel(),
    )


def _json_value(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if isinstance(value, Mapping):
        return {str(key): _json_value(item) for key, item in value.items()}
    if isinstance(value, list | tuple):
        return [_json_value(item) for item in value]
    return value


def run_dsl(
    dsl: str,
    *,
    inputs: Mapping[str, Any] | None = None,
    profile: Mapping[str, Any] | None = None,
    workflow_id: str | None = None,
) -> dict[str, Any]:
    engine = _load_engine(
        dsl=dsl,
        inputs=inputs or {},
        profile=profile,
        workflow_id=workflow_id or str(uuid4()),
    )
    trace_by_execution: dict[str, dict[str, Any]] = {}
    trace_order: list[str] = []
    outputs: dict[str, Any] = {}
    status = "failed"
    warnings: list[str] = []

    for event in engine.run():
        if isinstance(event, NodeRunStartedEvent):
            trace_by_execution[event.id] = {
                "id": event.id,
                "nodeId": event.node_id,
                "nodeType": str(event.node_type),
                "title": event.node_title or str(event.node_type),
                "status": "running",
                "startedAt": event.start_at.isoformat(),
                "inputs": _json_value(event.node_run_result.inputs),
                "outputs": {},
            }
            trace_order.append(event.id)
        elif isinstance(
            event,
            (NodeRunSucceededEvent, NodeRunFailedEvent, NodeRunExceptionEvent),
        ):
            step = trace_by_execution.setdefault(
                event.id,
                {
                    "id": event.id,
                    "nodeId": event.node_id,
                    "nodeType": str(event.node_type),
                    "title": str(event.node_type),
                    "startedAt": event.start_at.isoformat(),
                    "inputs": {},
                    "outputs": {},
                },
            )
            if event.id not in trace_order:
                trace_order.append(event.id)
            step.update({
                "status": (
                    "succeeded"
                    if isinstance(event, NodeRunSucceededEvent)
                    else "failed"
                ),
                "finishedAt": (
                    event.finished_at.isoformat() if event.finished_at else None
                ),
                "inputs": _json_value(event.node_run_result.inputs),
                "outputs": _json_value(event.node_run_result.outputs),
            })
            error = getattr(event, "error", "") or event.node_run_result.error
            if error:
                step["message"] = str(error)
        elif isinstance(event, GraphRunSucceededEvent):
            status = "succeeded"
            outputs = _json_value(event.outputs)
        elif isinstance(event, GraphRunPartialSucceededEvent):
            status = "failed"
            outputs = _json_value(event.outputs)
            warnings.append(
                f"Graphon completed partially with {event.exceptions_count} exception(s)."
            )
        elif isinstance(event, GraphRunPausedEvent):
            status = "paused"
            outputs = _json_value(event.outputs)
        elif isinstance(event, GraphRunAbortedEvent):
            status = "failed"
            outputs = _json_value(event.outputs)
            warnings.append(event.reason or "Graphon execution was aborted.")
        elif isinstance(event, GraphRunFailedEvent):
            status = "failed"
            warnings.append(event.error)

    return {
        "status": status,
        "outputs": outputs,
        "trace": [trace_by_execution[item] for item in trace_order],
        "warnings": warnings,
        "engine": runtime_status(),
    }
