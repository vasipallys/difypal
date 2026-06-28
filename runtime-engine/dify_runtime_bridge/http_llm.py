from __future__ import annotations

import json
from collections.abc import Generator, Mapping, Sequence
from typing import Any, Literal, overload

import httpx
from graphon.model_runtime.entities.common_entities import I18nObject
from graphon.model_runtime.entities.llm_entities import (
    LLMResult,
    LLMResultChunk,
    LLMResultChunkDelta,
    LLMResultChunkWithStructuredOutput,
    LLMResultWithStructuredOutput,
    LLMUsage,
)
from graphon.model_runtime.entities.message_entities import (
    AssistantPromptMessage,
    PromptMessage,
    PromptMessageRole,
    PromptMessageTool,
)
from graphon.model_runtime.entities.model_entities import (
    AIModelEntity,
    FetchFrom,
    ModelFeature,
    ModelType,
)


class StructuredOutputParseError(ValueError):
    pass


class HttpProfileLLM:
    """Graphon LLMProtocol backed by a Studio provider profile."""

    def __init__(
        self,
        *,
        profile: Mapping[str, Any],
        model_name: str,
        parameters: Mapping[str, Any] | None = None,
    ) -> None:
        self._profile = dict(profile)
        self._provider = str(profile.get("type") or "openai-compatible")
        self._model_name = str(profile.get("model") or model_name)
        self._parameters = {
            "temperature": profile.get("temperature", 0.3),
            "max_tokens": profile.get("maxTokens", 2048),
            **dict(parameters or {}),
        }
        self._stop: Sequence[str] | None = None

    @property
    def provider(self) -> str:
        return self._provider

    @property
    def model_name(self) -> str:
        return self._model_name

    @property
    def parameters(self) -> Mapping[str, Any]:
        return dict(self._parameters)

    @parameters.setter
    def parameters(self, value: Mapping[str, Any]) -> None:
        self._parameters = dict(value)

    @property
    def stop(self) -> Sequence[str] | None:
        return self._stop

    def get_model_schema(self) -> AIModelEntity:
        return AIModelEntity(
            model=self._model_name,
            label=I18nObject(en_US=self._model_name, zh_Hans=self._model_name),
            model_type=ModelType.LLM,
            features=[ModelFeature.STRUCTURED_OUTPUT],
            fetch_from=FetchFrom.CUSTOMIZABLE_MODEL,
            model_properties={},
            parameter_rules=[],
        )

    def get_llm_num_tokens(self, prompt_messages: Sequence[PromptMessage]) -> int:
        text = "\n".join(message.get_text_content() for message in prompt_messages)
        return max(1, len(text) // 4)

    @overload
    def invoke_llm(
        self,
        *,
        prompt_messages: Sequence[PromptMessage],
        model_parameters: Mapping[str, Any],
        tools: Sequence[PromptMessageTool] | None,
        stop: Sequence[str] | None,
        stream: Literal[False],
    ) -> LLMResult: ...

    @overload
    def invoke_llm(
        self,
        *,
        prompt_messages: Sequence[PromptMessage],
        model_parameters: Mapping[str, Any],
        tools: Sequence[PromptMessageTool] | None,
        stop: Sequence[str] | None,
        stream: Literal[True],
    ) -> Generator[LLMResultChunk, None, None]: ...

    def invoke_llm(
        self,
        *,
        prompt_messages: Sequence[PromptMessage],
        model_parameters: Mapping[str, Any],
        tools: Sequence[PromptMessageTool] | None,
        stop: Sequence[str] | None,
        stream: bool,
    ) -> LLMResult | Generator[LLMResultChunk, None, None]:
        if tools:
            raise RuntimeError(
                "Tool calling requires the official Dify Slim plugin runtime."
            )
        text = self._request(
            prompt_messages=prompt_messages,
            model_parameters=model_parameters,
            stop=stop,
        )
        if stream:
            return self._single_chunk(prompt_messages, text)
        return self._result(prompt_messages, text)

    @overload
    def invoke_llm_with_structured_output(
        self,
        *,
        prompt_messages: Sequence[PromptMessage],
        json_schema: Mapping[str, Any],
        model_parameters: Mapping[str, Any],
        stop: Sequence[str] | None,
        stream: Literal[False],
    ) -> LLMResultWithStructuredOutput: ...

    @overload
    def invoke_llm_with_structured_output(
        self,
        *,
        prompt_messages: Sequence[PromptMessage],
        json_schema: Mapping[str, Any],
        model_parameters: Mapping[str, Any],
        stop: Sequence[str] | None,
        stream: Literal[True],
    ) -> Generator[LLMResultChunkWithStructuredOutput, None, None]: ...

    def invoke_llm_with_structured_output(
        self,
        *,
        prompt_messages: Sequence[PromptMessage],
        json_schema: Mapping[str, Any],
        model_parameters: Mapping[str, Any],
        stop: Sequence[str] | None,
        stream: bool,
    ) -> (
        LLMResultWithStructuredOutput
        | Generator[LLMResultChunkWithStructuredOutput, None, None]
    ):
        schema_prompt = PromptMessage.model_validate({
            "role": PromptMessageRole.USER,
            "content": (
                "Return only JSON matching this schema:\n"
                f"{json.dumps(dict(json_schema), separators=(',', ':'))}"
            ),
        })
        messages = [*prompt_messages, schema_prompt]
        text = self._request(
            prompt_messages=messages,
            model_parameters=model_parameters,
            stop=stop,
        )
        structured = self._parse_structured(text)
        if stream:
            return self._single_structured_chunk(messages, text, structured)
        base = self._result(messages, text)
        return LLMResultWithStructuredOutput(
            **base.model_dump(),
            structured_output=structured,
        )

    def is_structured_output_parse_error(self, error: Exception) -> bool:
        return isinstance(error, StructuredOutputParseError)

    def _request(
        self,
        *,
        prompt_messages: Sequence[PromptMessage],
        model_parameters: Mapping[str, Any],
        stop: Sequence[str] | None,
    ) -> str:
        provider = self._provider
        if provider == "anthropic":
            return self._request_anthropic(prompt_messages, model_parameters, stop)
        if provider == "gemini":
            return self._request_gemini(prompt_messages, model_parameters)
        if provider == "ollama":
            return self._request_ollama(prompt_messages, model_parameters)
        return self._request_openai(prompt_messages, model_parameters, stop)

    def _client(self) -> httpx.Client:
        timeout_ms = float(self._profile.get("timeout") or 60000)
        return httpx.Client(timeout=max(1.0, timeout_ms / 1000))

    def _base_url(self) -> str:
        return str(self._profile.get("baseUrl") or "").rstrip("/")

    def _api_key(self) -> str:
        return str(self._profile.get("apiKey") or "")

    def _merged_parameters(self, override: Mapping[str, Any]) -> dict[str, Any]:
        return {**self._parameters, **dict(override)}

    @staticmethod
    def _messages(prompt_messages: Sequence[PromptMessage]) -> list[dict[str, str]]:
        return [
            {
                "role": message.role.value,
                "content": message.get_text_content(),
            }
            for message in prompt_messages
            if message.get_text_content()
        ]

    @staticmethod
    def _raise_for_status(response: httpx.Response) -> None:
        if response.is_success:
            return
        body = response.text[:500]
        raise RuntimeError(f"Provider returned HTTP {response.status_code}: {body}")

    def _request_openai(
        self,
        messages: Sequence[PromptMessage],
        parameters: Mapping[str, Any],
        stop: Sequence[str] | None,
    ) -> str:
        merged = self._merged_parameters(parameters)
        headers = {"Content-Type": "application/json"}
        if self._api_key():
            headers["Authorization"] = f"Bearer {self._api_key()}"
        payload = {
            "model": self._model_name,
            "messages": self._messages(messages),
            "temperature": merged.get("temperature", 0.3),
            "max_tokens": merged.get("max_tokens") or merged.get("maxTokens") or 2048,
            "stream": False,
        }
        if stop:
            payload["stop"] = list(stop)
        with self._client() as client:
            response = client.post(
                f"{self._base_url()}/chat/completions",
                headers=headers,
                json=payload,
            )
        self._raise_for_status(response)
        data = response.json()
        return str(data.get("choices", [{}])[0].get("message", {}).get("content") or "")

    def _request_anthropic(
        self,
        messages: Sequence[PromptMessage],
        parameters: Mapping[str, Any],
        stop: Sequence[str] | None,
    ) -> str:
        merged = self._merged_parameters(parameters)
        system = "\n".join(
            message.get_text_content()
            for message in messages
            if message.role == PromptMessageRole.SYSTEM
        )
        body_messages = [
            {
                "role": message.role.value,
                "content": message.get_text_content(),
            }
            for message in messages
            if message.role in {PromptMessageRole.USER, PromptMessageRole.ASSISTANT}
        ]
        payload: dict[str, Any] = {
            "model": self._model_name,
            "messages": body_messages,
            "temperature": merged.get("temperature", 0.3),
            "max_tokens": merged.get("max_tokens") or merged.get("maxTokens") or 2048,
        }
        if system:
            payload["system"] = system
        if stop:
            payload["stop_sequences"] = list(stop)
        with self._client() as client:
            response = client.post(
                f"{self._base_url()}/messages",
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": self._api_key(),
                    "anthropic-version": "2023-06-01",
                },
                json=payload,
            )
        self._raise_for_status(response)
        data = response.json()
        return "".join(
            str(part.get("text") or "")
            for part in data.get("content", [])
            if part.get("type") == "text"
        )

    def _request_gemini(
        self,
        messages: Sequence[PromptMessage],
        parameters: Mapping[str, Any],
    ) -> str:
        merged = self._merged_parameters(parameters)
        system = "\n".join(
            message.get_text_content()
            for message in messages
            if message.role == PromptMessageRole.SYSTEM
        )
        contents = [
            {
                "role": "model" if message.role == PromptMessageRole.ASSISTANT else "user",
                "parts": [{"text": message.get_text_content()}],
            }
            for message in messages
            if message.role != PromptMessageRole.SYSTEM
        ]
        payload: dict[str, Any] = {
            "contents": contents,
            "generationConfig": {
                "temperature": merged.get("temperature", 0.3),
                "maxOutputTokens": merged.get("max_tokens")
                or merged.get("maxTokens")
                or 2048,
            },
        }
        if system:
            payload["systemInstruction"] = {"parts": [{"text": system}]}
        with self._client() as client:
            response = client.post(
                f"{self._base_url()}/models/{self._model_name}:generateContent",
                headers={
                    "Content-Type": "application/json",
                    "x-goog-api-key": self._api_key(),
                },
                json=payload,
            )
        self._raise_for_status(response)
        data = response.json()
        candidates = data.get("candidates") or []
        parts = candidates[0].get("content", {}).get("parts", []) if candidates else []
        return "".join(str(part.get("text") or "") for part in parts)

    def _request_ollama(
        self,
        messages: Sequence[PromptMessage],
        parameters: Mapping[str, Any],
    ) -> str:
        merged = self._merged_parameters(parameters)
        with self._client() as client:
            response = client.post(
                f"{self._base_url()}/api/chat",
                headers={"Content-Type": "application/json"},
                json={
                    "model": self._model_name,
                    "messages": self._messages(messages),
                    "options": {"temperature": merged.get("temperature", 0.3)},
                    "stream": False,
                },
            )
        self._raise_for_status(response)
        return str(response.json().get("message", {}).get("content") or "")

    def _result(
        self,
        prompt_messages: Sequence[PromptMessage],
        text: str,
    ) -> LLMResult:
        return LLMResult(
            model=self._model_name,
            prompt_messages=list(prompt_messages),
            message=AssistantPromptMessage(content=text),
            usage=LLMUsage.empty_usage(),
        )

    def _single_chunk(
        self,
        prompt_messages: Sequence[PromptMessage],
        text: str,
    ) -> Generator[LLMResultChunk, None, None]:
        yield LLMResultChunk(
            model=self._model_name,
            prompt_messages=list(prompt_messages),
            delta=LLMResultChunkDelta(
                index=0,
                message=AssistantPromptMessage(content=text),
                usage=LLMUsage.empty_usage(),
                finish_reason="stop",
            ),
        )

    def _single_structured_chunk(
        self,
        prompt_messages: Sequence[PromptMessage],
        text: str,
        structured: Mapping[str, Any],
    ) -> Generator[LLMResultChunkWithStructuredOutput, None, None]:
        yield LLMResultChunkWithStructuredOutput(
            model=self._model_name,
            prompt_messages=list(prompt_messages),
            structured_output=structured,
            delta=LLMResultChunkDelta(
                index=0,
                message=AssistantPromptMessage(content=text),
                usage=LLMUsage.empty_usage(),
                finish_reason="stop",
            ),
        )

    @staticmethod
    def _parse_structured(text: str) -> Mapping[str, Any]:
        candidate = text.strip()
        if candidate.startswith("```"):
            candidate = candidate.removeprefix("```json").removeprefix("```")
            candidate = candidate.removesuffix("```").strip()
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError as error:
            raise StructuredOutputParseError(str(error)) from error
        if not isinstance(parsed, dict):
            raise StructuredOutputParseError("Structured output must be a JSON object.")
        return parsed
