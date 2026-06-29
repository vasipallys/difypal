from __future__ import annotations

import sys
import time
from collections.abc import Mapping
from copy import deepcopy
from hashlib import sha256
from importlib.metadata import version
import re
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

_GRAPHON_NODE_ID = re.compile(r"^[a-zA-Z0-9_]{1,50}$")
_LEGACY_STUDIO_PROMPT_PREFIX = "You are a reliable workflow assistant.\n\nTask:\n"
_LEGACY_STUDIO_PROMPT_SUFFIX = (
    "\n\nUse the supplied input. Do not invent missing facts. "
    "State uncertainty clearly. Return a concise, useful answer."
)


def _execution_system_prompt(objective: str) -> str:
    return (
        "You are the execution model inside an already-running Dify workflow. "
        "Apply the workflow behavior directly to the supplied user input.\n\n"
        f"Workflow behavior:\n{objective.strip()}\n\n"
        "The workflow has already been built. If the behavior is phrased as "
        "\"create a workflow\" or \"build a workflow\", interpret it as the "
        "processing that this running workflow must perform. Return only the "
        "requested result for the user input. Do not describe workflow design, "
        "implementation steps, nodes, or preprocessing. Do not invent missing "
        "facts, and state uncertainty clearly."
    )


class StudioNodeFactory(SlimDslNodeFactory):
    def __init__(self, *args: Any, profile: Mapping[str, Any] | None, **kwargs: Any):
        super().__init__(*args, **kwargs)
        self._studio_profile = dict(profile or {})
        self.llm_runtimes: dict[str, HttpProfileLLM] = {}

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
        runtime = HttpProfileLLM(
            profile=self._studio_profile,
            model_name=model_name,
            parameters=model.get("completion_params") or {},
        )
        self.llm_runtimes[node_id] = runtime
        return normalized, runtime


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


def _graphon_safe_node_id(
    node_id: str,
    *,
    index: int,
    used_ids: set[str],
) -> str:
    if _GRAPHON_NODE_ID.fullmatch(node_id) and node_id not in used_ids:
        return node_id
    sanitized = re.sub(r"[^a-zA-Z0-9_]", "_", node_id).strip("_")
    if not sanitized:
        sanitized = f"node_{index}"
    digest = sha256(node_id.encode("utf-8")).hexdigest()[:8]
    candidate = f"{sanitized[:41]}_{digest}"
    counter = 2
    while candidate in used_ids:
        suffix = f"_{counter}"
        candidate = f"{sanitized[:50 - len(suffix)]}{suffix}"
        counter += 1
    return candidate


def _rewrite_graph_references(value: Any, node_ids: Mapping[str, str]) -> Any:
    if isinstance(value, str):
        rewritten = node_ids.get(value, value)
        for original, normalized in node_ids.items():
            if original != normalized:
                rewritten = rewritten.replace(
                    f"{{{{#{original}.",
                    f"{{{{#{normalized}.",
                )
        return rewritten
    if isinstance(value, list):
        return [_rewrite_graph_references(item, node_ids) for item in value]
    if isinstance(value, Mapping):
        return {
            str(key): _rewrite_graph_references(item, node_ids)
            for key, item in value.items()
        }
    return value


def _migrate_legacy_studio_prompts(graph_config: dict[str, Any]) -> int:
    migrated = 0
    nodes = graph_config.get("nodes", [])
    for node in nodes if isinstance(nodes, list) else []:
        if not isinstance(node, dict):
            continue
        data = node.get("data")
        if not isinstance(data, dict) or data.get("type") != "llm":
            continue
        prompt_template = data.get("prompt_template")
        if not isinstance(prompt_template, list):
            continue
        for message in prompt_template:
            if not isinstance(message, dict) or message.get("role") != "system":
                continue
            text = message.get("text")
            if not isinstance(text, str):
                continue
            if not (
                text.startswith(_LEGACY_STUDIO_PROMPT_PREFIX)
                and text.endswith(_LEGACY_STUDIO_PROMPT_SUFFIX)
            ):
                continue
            objective = text[
                len(_LEGACY_STUDIO_PROMPT_PREFIX):
                -len(_LEGACY_STUDIO_PROMPT_SUFFIX)
            ]
            message["text"] = _execution_system_prompt(objective)
            migrated += 1
    return migrated


def _normalize_graphon_node_ids(
    graph_config: Mapping[str, Any],
) -> tuple[dict[str, Any], dict[str, str], int]:
    graph_copy = deepcopy(dict(graph_config))
    migrated_prompts = _migrate_legacy_studio_prompts(graph_copy)
    nodes = graph_config.get("nodes", [])
    used_ids: set[str] = set()
    node_ids: dict[str, str] = {}
    for index, node in enumerate(nodes if isinstance(nodes, list) else []):
        if not isinstance(node, Mapping):
            continue
        original = str(node.get("id") or "")
        if not original:
            continue
        normalized = _graphon_safe_node_id(
            original,
            index=index,
            used_ids=used_ids,
        )
        node_ids[original] = normalized
        used_ids.add(normalized)

    normalized_graph = _rewrite_graph_references(
        graph_copy,
        node_ids,
    )
    return normalized_graph, {
        normalized: original for original, normalized in node_ids.items()
    }, migrated_prompts


def _load_engine(
    *,
    dsl: str,
    inputs: Mapping[str, Any],
    profile: Mapping[str, Any] | None,
    workflow_id: str,
) -> tuple[GraphEngine, dict[str, str], dict[str, HttpProfileLLM], int]:
    plan = inspect(dsl)
    if plan.load_status != LoadStatus.LOADABLE:
        raise RuntimeError(plan.load_reason or f"DSL is {plan.load_status.value}.")
    source_graph_config = plan.document.graph_config
    if source_graph_config is None:
        raise RuntimeError("DSL does not contain an executable graph.")
    graph_config, original_node_ids, migrated_prompts = _normalize_graphon_node_ids(
        source_graph_config,
    )

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
    engine = GraphEngine(
        workflow_id=workflow_id,
        graph=graph,
        graph_runtime_state=runtime_state,
        command_channel=InMemoryChannel(),
    )
    return engine, original_node_ids, factory.llm_runtimes, migrated_prompts


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
    engine, original_node_ids, llm_runtimes, migrated_prompts = _load_engine(
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
    if migrated_prompts:
        warnings.append(
            "Applied the execution-oriented compatibility prompt to "
            f"{migrated_prompts} legacy Studio LLM node(s)."
        )

    for event in engine.run():
        original_node_id = original_node_ids.get(event.node_id, event.node_id) \
            if hasattr(event, "node_id") else None
        if isinstance(event, NodeRunStartedEvent):
            trace_by_execution[event.id] = {
                "id": event.id,
                "nodeId": original_node_id,
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
            trace_inputs = _json_value(event.node_run_result.inputs)
            llm_runtime = llm_runtimes.get(event.node_id)
            if llm_runtime and llm_runtime.last_prompt_messages:
                trace_inputs = {
                    **trace_inputs,
                    "prompt_messages": llm_runtime.last_prompt_messages,
                }
            step.update({
                "status": (
                    "succeeded"
                    if isinstance(event, NodeRunSucceededEvent)
                    else "failed"
                ),
                "finishedAt": (
                    event.finished_at.isoformat() if event.finished_at else None
                ),
                "inputs": trace_inputs,
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
