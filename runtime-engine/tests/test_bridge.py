from __future__ import annotations

import yaml

from dify_runtime_bridge import inspect_dsl, run_dsl
from dify_runtime_bridge.http_llm import HttpProfileLLM


def deterministic_dsl() -> str:
    return yaml.safe_dump({
        "kind": "graph",
        "graph": {
            "nodes": [
                {
                    "id": "start",
                    "data": {
                        "type": "start",
                        "title": "Start",
                        "variables": [
                            {
                                "variable": "query",
                                "label": "Query",
                                "type": "text-input",
                                "required": True,
                            }
                        ],
                    },
                },
                {
                    "id": "template",
                    "data": {
                        "type": "template-transform",
                        "title": "Template",
                        "variables": [
                            {
                                "variable": "query",
                                "value_selector": ["start", "query"],
                            }
                        ],
                        "template": "Echo: {{ query }}",
                    },
                },
                {
                    "id": "end",
                    "data": {
                        "type": "end",
                        "title": "End",
                        "outputs": [
                            {
                                "variable": "result",
                                "value_selector": ["template", "output"],
                            }
                        ],
                    },
                },
            ],
            "edges": [
                {"source": "start", "target": "template"},
                {"source": "template", "target": "end"},
            ],
        },
    })


def test_inspects_loadable_dsl() -> None:
    result = inspect_dsl(deterministic_dsl())
    assert result["loadable"] is True
    assert result["kind"] == "graph"


def test_runs_deterministic_graphon_workflow() -> None:
    result = run_dsl(deterministic_dsl(), inputs={"input": "hello"})
    assert result["status"] == "succeeded"
    assert result["outputs"] == {"result": "Echo: hello"}
    assert [step["nodeType"] for step in result["trace"]] == [
        "start",
        "template-transform",
        "end",
    ]
    assert result["engine"]["engine"] == "graphon"


def test_runs_graphon_llm_node_through_studio_profile(
    monkeypatch,
) -> None:
    dsl = yaml.safe_dump({
        "kind": "graph",
        "graph": {
            "nodes": [
                {
                    "id": "start",
                    "data": {
                        "type": "start",
                        "title": "Start",
                        "variables": [],
                    },
                },
                {
                    "id": "llm",
                    "data": {
                        "type": "llm",
                        "title": "LLM",
                        "model": {
                            "provider": "openai",
                            "name": "dsl-model",
                            "mode": "chat",
                            "completion_params": {},
                        },
                        "prompt_template": [
                            {
                                "role": "user",
                                "text": "{{#sys.query#}}",
                            }
                        ],
                        "context": {
                            "enabled": False,
                            "variable_selector": [],
                        },
                        "vision": {"enabled": False},
                    },
                },
                {
                    "id": "end",
                    "data": {
                        "type": "end",
                        "title": "End",
                        "outputs": [
                            {
                                "variable": "answer",
                                "value_selector": ["llm", "text"],
                            }
                        ],
                    },
                },
            ],
            "edges": [
                {"source": "start", "target": "llm"},
                {"source": "llm", "target": "end"},
            ],
        },
    })
    monkeypatch.setattr(
        HttpProfileLLM,
        "_request",
        lambda self, **kwargs: "profile adapter response",
    )

    result = run_dsl(
        dsl,
        inputs={"query": "hello"},
        profile={
            "type": "openai",
            "baseUrl": "https://example.invalid/v1",
            "model": "profile-model",
            "apiKey": "secret",
            "temperature": 0.2,
            "maxTokens": 128,
            "timeout": 5000,
        },
    )

    assert result["status"] == "succeeded"
    assert result["outputs"] == {"answer": "profile adapter response"}
