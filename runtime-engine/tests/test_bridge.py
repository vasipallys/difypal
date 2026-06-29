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
    captured: dict[str, object] = {}
    dsl = yaml.safe_dump({
        "kind": "graph",
        "graph": {
            "nodes": [
                {
                    "id": "start-with-hyphen",
                    "data": {
                        "type": "start",
                        "title": "Start",
                        "variables": [
                            {
                                "variable": "input",
                                "label": "Input",
                                "type": "text-input",
                                "required": True,
                            }
                        ],
                    },
                },
                {
                    "id": "llm-with-hyphen",
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
                                "text": "{{#start-with-hyphen.input#}}",
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
                    "id": "end-with-hyphen",
                    "data": {
                        "type": "end",
                        "title": "End",
                        "outputs": [
                            {
                                "variable": "answer",
                                "value_selector": ["llm-with-hyphen", "text"],
                            }
                        ],
                    },
                },
            ],
            "edges": [
                {"source": "start-with-hyphen", "target": "llm-with-hyphen"},
                {"source": "llm-with-hyphen", "target": "end-with-hyphen"},
            ],
        },
    })
    def capture_request(self, **kwargs):
        captured["messages"] = [
            {
                "role": message.role.value,
                "content": message.get_text_content(),
            }
            for message in kwargs["prompt_messages"]
        ]
        return "profile adapter response"

    monkeypatch.setattr(
        HttpProfileLLM,
        "_request",
        capture_request,
    )

    result = run_dsl(
        dsl,
        inputs={"input": "Hello from input"},
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
    assert captured["messages"] == [
        {"role": "user", "content": "Hello from input"},
    ]
    assert [step["nodeId"] for step in result["trace"]] == [
        "start-with-hyphen",
        "llm-with-hyphen",
        "end-with-hyphen",
    ]
    assert result["trace"][1]["inputs"]["prompt_messages"] == captured["messages"]


def test_migrates_only_the_legacy_studio_system_prompt(monkeypatch) -> None:
    captured: dict[str, object] = {}
    objective = "create a workflow to give sentiment of the user input"
    legacy_prompt = (
        "You are a reliable workflow assistant.\n\n"
        f"Task:\n{objective}\n\n"
        "Use the supplied input. Do not invent missing facts. "
        "State uncertainty clearly. Return a concise, useful answer."
    )
    dsl = yaml.safe_dump({
        "kind": "graph",
        "graph": {
            "nodes": [
                {
                    "id": "start-old-id",
                    "data": {
                        "type": "start",
                        "title": "Input",
                        "variables": [{
                            "variable": "input",
                            "label": "Input",
                            "type": "text-input",
                            "required": True,
                        }],
                    },
                },
                {
                    "id": "llm-old-id",
                    "data": {
                        "type": "llm",
                        "title": "Sentiment",
                        "model": {
                            "provider": "groq",
                            "name": "dsl-model",
                            "mode": "chat",
                            "completion_params": {},
                        },
                        "prompt_template": [
                            {"role": "system", "text": legacy_prompt},
                            {
                                "role": "user",
                                "text": "{{#start-old-id.input#}}",
                            },
                        ],
                        "context": {
                            "enabled": False,
                            "variable_selector": [],
                        },
                        "vision": {"enabled": False},
                    },
                },
                {
                    "id": "end-old-id",
                    "data": {
                        "type": "end",
                        "title": "End",
                        "outputs": [{
                            "variable": "answer",
                            "value_selector": ["llm-old-id", "text"],
                        }],
                    },
                },
            ],
            "edges": [
                {"source": "start-old-id", "target": "llm-old-id"},
                {"source": "llm-old-id", "target": "end-old-id"},
            ],
        },
    })

    def capture_request(self, **kwargs):
        captured["messages"] = [
            {
                "role": message.role.value,
                "content": message.get_text_content(),
            }
            for message in kwargs["prompt_messages"]
        ]
        return "Positive"

    monkeypatch.setattr(HttpProfileLLM, "_request", capture_request)
    result = run_dsl(
        dsl,
        inputs={"input": "Good morning Ganesha"},
        profile={
            "type": "groq",
            "baseUrl": "https://example.invalid/openai/v1",
            "model": "profile-model",
            "apiKey": "secret",
        },
    )

    messages = captured["messages"]
    assert isinstance(messages, list)
    assert messages[0]["role"] == "system"
    assert "already been built" in messages[0]["content"]
    assert "Do not describe workflow design" in messages[0]["content"]
    assert messages[1] == {
        "role": "user",
        "content": "Good morning Ganesha",
    }
    assert result["outputs"] == {"answer": "Positive"}
    assert result["warnings"] == [
        "Applied the execution-oriented compatibility prompt to "
        "1 legacy Studio LLM node(s)."
    ]
