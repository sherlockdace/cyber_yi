"""Request a reading from an explicitly configured compatible model."""

import os
import re
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass

from dotenv import load_dotenv
from httpx2 import HTTPError, TimeoutException
from openai import APIError, APIStatusError, APITimeoutError, OpenAI

from .config import ModelSettings, Settings, read_yaml
from .divination import Reading, line_label, required_text

PROMPT_VARIABLE = re.compile(r"\{\{\s*(\w+)\s*\}\}")


class ModelFailure(Exception):
    """An interpretation error with a user-safe message and an HTTP status code."""

    def __init__(self, message: str, status: int) -> None:
        """Store message for the user and status for the local HTTP response."""
        super().__init__(message)
        self.status = status


@contextmanager
def provider_errors() -> Iterator[None]:
    """Translate model request and stream-read failures to user-facing ModelFailure errors."""
    try:
        yield
    except (APITimeoutError, TimeoutException) as error:
        raise ModelFailure("模型服务超时，可用原卦重试", 504) from error
    except APIStatusError as error:
        if error.status_code in (401, 403):
            raise ModelFailure("模型服务认证或授权失败，请检查密钥及权限", 502) from error
        if error.status_code == 429:
            raise ModelFailure("模型服务限流，请稍后用原卦重试", 429) from error
        raise ModelFailure(f"模型服务返回 HTTP {error.status_code}，可用原卦重试", 502) from error
    except (APIError, HTTPError, ValueError) as error:
        raise ModelFailure("模型服务连接失败或响应无效，可用原卦重试", 502) from error


def check_finish_reason(reason: str | None) -> None:
    """Raise ModelFailure if reason indicates truncated or interrupted completion."""
    if reason == "length":
        raise ModelFailure("模型达到输出长度上限，请检查 token 配置后用原卦重试", 502)
    if reason not in (None, "stop"):
        raise ModelFailure("模型解读未完整生成，可用原卦重试", 502)


@dataclass(frozen=True)
class Interpreter:
    """A model client and the settings needed to construct a text-only request."""

    client: OpenAI
    settings: ModelSettings
    system_prompt: str
    user_prompt: str

    def messages(self, question: str, reading: Reading) -> list[dict[str, str]]:
        """Render request messages from question and the canonical evidence in reading."""
        values = {"question": question, "cast": describe_cast(reading), "passages": describe_passages(reading)}
        user_message = PROMPT_VARIABLE.sub(lambda match: values[match[1]], self.user_prompt)
        return [{"role": "system", "content": self.system_prompt}, {"role": "user", "content": user_message}]

    def interpret(self, question: str, reading: Reading) -> str:
        """Send question and reading to the provider and return the final answer text.

        This performs network I/O. Raise ModelFailure for invalid or failed responses.
        """
        with provider_errors():
            completion = self.client.chat.completions.create(
                model=self.settings.name,
                messages=self.messages(question, reading),
                stream=False,
                **self.settings.generation,
            )
        choices = getattr(completion, "choices", None)
        choice = choices[0] if isinstance(choices, list) and choices else None
        check_finish_reason(getattr(choice, "finish_reason", None))
        message = getattr(choice, "message", None)
        text = getattr(message, "content", None)
        if not isinstance(text, str) or not text.strip():
            raise ModelFailure("模型没有返回解读文本，可用原卦重试", 502)
        return text.strip()

    def stream_interpretation(self, question: str, reading: Reading) -> Iterator[tuple[str, str]]:
        """Send question and reading, yielding provider field name and text as deltas arrive.

        Yield reasoning_content and content independently. Close the generator to
        release the upstream connection early. Raise ModelFailure for incomplete responses.
        """
        finished = False
        has_answer = False
        with provider_errors(), self.client.chat.completions.create(
            model=self.settings.name, messages=self.messages(question, reading),
            stream=True, **self.settings.generation,
        ) as stream:
            for chunk in stream:
                if not chunk.choices:
                    continue
                choice = chunk.choices[0]
                for field in ("reasoning_content", "content"):
                    text = getattr(choice.delta, field, None)
                    if isinstance(text, str) and text:
                        if field == "content" and text.strip():
                            has_answer = True
                        yield field, text
                check_finish_reason(choice.finish_reason)
                if choice.finish_reason == "stop":
                    finished = True
        if not finished:
            raise ModelFailure("模型连接提前结束，可用原卦重试", 502)
        if not has_answer:
            raise ModelFailure("模型没有返回解读正文，可用原卦重试", 502)


def describe_cast(reading: Reading) -> str:
    """Describe reading's hexagrams, bottom-to-top values and named moving lines in Chinese."""
    primary = reading.primary
    lines = [f"本卦：{primary.name}（第{primary.number}卦，{primary.upper}上{primary.lower}下）"]
    changed = reading.changed
    if changed is not None:
        lines.append(f"变卦：{changed.name}（第{changed.number}卦，{changed.upper}上{changed.lower}下）")
    lines.append("六爻（从初爻到上爻）：" + "、".join(map(str, reading.values)))
    moving = "、".join(line_label(primary, position) for position in reading.moving_lines)
    lines.append(f"动爻：{len(reading.moving_lines)} 爻（{moving}）" if moving else "动爻：无")
    return "\n".join(lines)


def describe_passages(reading: Reading) -> str:
    """Format reading's selected quotations, roles and corresponding commentary in order."""
    roles = {"主": "主读", "辅": "参读", "贞": "贞，本卦", "悔": "悔，变卦"}
    quotations = []
    for item in reading.passages:
        heading = f"{item.hexagram_name}·{item.label}（{roles[item.role]}）：{item.text}"
        commentary = [f"{name}：{text}" for name, text in item.commentary.items()]
        quotations.append("\n".join([heading, *commentary]))
    return "\n\n".join(quotations)


def open_interpreter(settings: Settings) -> Interpreter:
    """Open an SDK client from settings and the configured dotenv path.

    The process environment takes precedence over dotenv values. The caller closes
    the returned object's client. Raise ModelFailure when the configuration is incomplete.
    """
    if settings.model is None:
        raise ModelFailure("尚未配置模型地址与名称，可离线起卦和查经", 503)
    load_dotenv(settings.dotenv, override=False)
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise ModelFailure("缺少 OPENAI_API_KEY，可离线起卦和查经", 503)
    model = settings.model
    try:
        prompts = read_yaml(model.prompts)
        system_prompt = required_text(prompts["system"])
        user_prompt = required_text(prompts["user"])
        remainder = PROMPT_VARIABLE.sub("", user_prompt)
        if (set(PROMPT_VARIABLE.findall(user_prompt)) != {"question", "cast", "passages"}
                or "{{" in remainder or "}}" in remainder):
            raise ValueError("user 提示模板需要 {{ question }}、{{ cast }} 和 {{ passages }}")
    except (OSError, TypeError, ValueError, KeyError) as error:
        raise ModelFailure("模型提示文件需要非空的 system、user 与有效的提示词占位符", 503) from error
    client = OpenAI(api_key=api_key, base_url=model.base_url,
                    timeout=model.timeout, max_retries=model.max_retries)
    return Interpreter(client, model, system_prompt, user_prompt)
