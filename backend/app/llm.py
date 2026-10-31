"""Provider-agnostic model client.

DeepSeek is the development stand-in; Meta Muse Spark is the submission target.
Both speak the OpenAI chat-completions shape, so one adapter covers both and
only base_url/model/key change.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Protocol

MODEL_CONFIG = {
    "deepseek": {
        "base_url": "https://api.deepseek.com",
        "model": "deepseek-chat",
        "key_env": "DEEPSEEK_API_KEY",
    },
    "meta": {
        "base_url": "https://api.meta.ai/v1",
        "model": "muse-spark-1.3",
        "key_env": "META_API_KEY",
    },
}


@dataclass(frozen=True)
class LLMReply:
    text: str
    response_id: str | None = None
    cache_hit_tokens: int = 0
    output_tokens: int = 0


class LLMClient(Protocol):
    def complete(
        self,
        messages: list[dict[str, str]],
        *,
        effort: str = "medium",
        response_id: str | None = None,
    ) -> LLMReply: ...


class FakeClient:
    """Deterministic stand-in for tests and offline demos. Never spends credits."""

    def __init__(self, replies: list[str], vision: bool = True) -> None:
        self._replies = list(replies)
        self.vision = vision
        self.calls: list[list[dict[str, str]]] = []

    def complete(
        self,
        messages: list[dict[str, str]],
        *,
        effort: str = "medium",
        response_id: str | None = None,
    ) -> LLMReply:
        self.calls.append(messages)
        if not self._replies:
            raise RuntimeError("FakeClient ran out of canned replies")
        return LLMReply(text=self._replies.pop(0), response_id="fake-response")


class OpenAICompatClient:
    """One HTTP shape for DeepSeek and Meta Model API.

    `developer` roles are mapped to `system` for providers that don't know them.
    `previous_response_id` is sent only when supplied; DeepSeek ignores it, so
    repair turns carry the prior exchange in `messages` instead.
    """

    def __init__(
        self,
        api_key: str,
        base_url: str,
        model: str,
        timeout: float = 25.0,
        supports_developer_role: bool = False,
        supports_response_chaining: bool = False,
        vision: bool = False,
    ) -> None:
        from openai import OpenAI

        self._client = OpenAI(api_key=api_key, base_url=base_url, timeout=timeout, max_retries=1)
        self._model = model
        self._developer_role = supports_developer_role
        self._chaining = supports_response_chaining
        self.vision = vision

    def complete(
        self,
        messages: list[dict[str, str]],
        *,
        effort: str = "medium",
        response_id: str | None = None,
    ) -> LLMReply:
        payload = [
            {**message, "role": "system" if message["role"] == "developer" and not self._developer_role else message["role"]}
            for message in messages
        ]
        extra: dict = {}
        if self._chaining and response_id:
            extra["previous_response_id"] = response_id
        response = self._client.chat.completions.create(
            model=self._model,
            messages=payload,
            temperature=0.2,
            **extra,
        )
        usage = response.usage
        cache_hit = getattr(usage, "prompt_cache_hit_tokens", 0) or 0
        return LLMReply(
            text=response.choices[0].message.content or "",
            response_id=getattr(response, "id", None),
            cache_hit_tokens=cache_hit,
            output_tokens=getattr(usage, "completion_tokens", 0) or 0,
        )


def client_from_env(provider: str | None = None) -> LLMClient:
    provider = (provider or os.getenv("LLM_PROVIDER") or "deepseek").lower()
    if provider not in MODEL_CONFIG:
        raise ValueError(f"unknown LLM_PROVIDER {provider!r}; expected one of {sorted(MODEL_CONFIG)}")
    config = MODEL_CONFIG[provider]
    api_key = os.getenv(config["key_env"])
    if not api_key:
        raise ValueError(f"{config['key_env']} is not set; add it to F:\\Recalloop\\.env")
    return OpenAICompatClient(
        api_key=api_key,
        base_url=config["base_url"],
        model=config["model"],
        supports_developer_role=provider == "meta",
        supports_response_chaining=provider == "meta",
        vision=provider == "meta",
    )
