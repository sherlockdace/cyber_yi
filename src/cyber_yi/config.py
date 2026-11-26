"""Load and validate the application's YAML configuration."""

import math
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

import yaml

from .divination import required_text


@dataclass(frozen=True)
class ModelSettings:
    """Settings sent to a configured Chat Completions provider."""

    base_url: str
    name: str
    timeout: float
    max_retries: int
    prompts: Path
    generation: dict[str, object]


@dataclass(frozen=True)
class Settings:
    """Resolved paths and limits for CLI and local web use."""

    corpus: Path
    dotenv: Path
    max_question_length: int
    port: int
    model: ModelSettings | None


def read_yaml(path: Path) -> dict:
    """Load the UTF-8 YAML mapping at path.

    Raise OSError for unreadable files, ValueError for invalid YAML and TypeError for non-mappings.
    """
    try:
        with path.open(encoding="utf-8") as file:
            value = yaml.safe_load(file)
    except yaml.YAMLError as error:
        raise ValueError(f"{path} 不是有效的 YAML") from error
    if not isinstance(value, dict):
        raise TypeError(f"{path} 必须包含 YAML 映射")
    return value


def load_settings(path: Path) -> Settings:
    """Read settings from path and resolve related paths against its parent directory.

    An omitted model endpoint and name select offline mode. Raise OSError if the
    settings file is unreadable or ValueError for invalid settings.
    """
    directory = path.resolve().parent
    try:
        data = read_yaml(path)
        model_data = data["model"]
        if not isinstance(model_data, dict):
            raise TypeError("model 必须是映射")
        base_url = model_data["base_url"]
        name = model_data["name"]
        model = None
        if base_url is not None or name is not None:
            model = load_model_settings(model_data, directory)
        return Settings(
            directory / required_text(data["corpus"]),
            directory / required_text(data["dotenv"]),
            bounded_integer(data["max_question_length"], "max_question_length", 1, 8000),
            bounded_integer(data["port"], "port", 0, 65535),
            model,
        )
    except KeyError as error:
        raise ValueError(f"{path} 缺少配置项 {error.args[0]}") from error
    except TypeError as error:
        raise ValueError(str(error)) from error


def bounded_integer(value: object, name: str, minimum: int, maximum: int) -> int:
    """Return value as an integer within inclusive bounds, or raise ValueError naming name."""
    if type(value) is not int or not minimum <= value <= maximum:
        raise ValueError(f"{name} 必须是 {minimum}–{maximum} 的整数")
    return value


def load_model_settings(data: dict, directory: Path) -> ModelSettings:
    """Validate model settings in data, resolving the prompts path relative to directory.

    Return model settings and raise ValueError for invalid values or KeyError for missing fields.
    """
    name = data["name"]
    base_url = data["base_url"]
    if not isinstance(name, str) or not name.strip() or not isinstance(base_url, str):
        raise ValueError("启用模型时须同时配置 model.name 和 model.base_url")
    base_url = base_url.strip()
    url = urlsplit(base_url)
    if (url.scheme not in {"http", "https"} or not url.hostname or url.username is not None
            or url.query or url.fragment or any(char.isspace() for char in base_url)):
        raise ValueError("model.base_url 必须是 HTTP(S) API 根地址，且不含凭据、查询参数或锚点")
    _ = url.port  # urlsplit defers port validation until it is read.
    timeout = data["timeout"]
    if type(timeout) not in (int, float) or not math.isfinite(timeout) or timeout <= 0:
        raise ValueError("model.timeout 必须是有限的正秒数")
    return ModelSettings(base_url, name.strip(), float(timeout),
                         bounded_integer(data["max_retries"], "model.max_retries", 0, 2),
                         directory / required_text(data["prompts"]), generation_options(data))


def generation_options(data: dict) -> dict[str, object]:
    """Return SDK keyword arguments for the non-null model options in data.

    Raise ValueError on out-of-range settings or incompatible token limit fields.
    """
    options = {}
    effort = data.get("reasoning_effort")
    if effort is not None:
        if not isinstance(effort, str) or effort not in (
            "none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra",
        ):
            raise ValueError("model.reasoning_effort 不是支持的推理强度")
        options["reasoning_effort"] = effort

    thinking = data.get("thinking")
    if thinking is not None:
        if not isinstance(thinking, dict) or thinking.get("type") not in ("enabled", "disabled"):
            raise ValueError("model.thinking.type 必须是 enabled 或 disabled")
        options["extra_body"] = {"thinking": {"type": thinking["type"]}}

    max_tokens = data.get("max_tokens")
    max_completion_tokens = data.get("max_completion_tokens")
    if max_tokens is not None and max_completion_tokens is not None:
        raise ValueError("model.max_tokens 和 model.max_completion_tokens 请只设一个")
    if max_tokens is not None:
        options["max_tokens"] = bounded_integer(max_tokens, "model.max_tokens", 1, 393216)
    if max_completion_tokens is not None:
        if type(max_completion_tokens) is not int or max_completion_tokens < 1:
            raise ValueError("model.max_completion_tokens 必须是正整数或 null")
        options["max_completion_tokens"] = max_completion_tokens

    temperature = data.get("temperature")
    if temperature is not None:
        if type(temperature) not in (int, float) or not 0 <= temperature <= 2:
            raise ValueError("model.temperature 必须是 0–2 的数值或 null")
        options["temperature"] = temperature
    top_p = data.get("top_p")
    if top_p is not None:
        if type(top_p) not in (int, float) or not 0 < top_p <= 1:
            raise ValueError("model.top_p 必须大于 0 且不超过 1，或设为 null")
        options["top_p"] = top_p

    stop = data.get("stop")
    if stop is not None:
        sequences = [stop] if isinstance(stop, str) else stop
        if not isinstance(sequences, list) or not 1 <= len(sequences) <= 16 or any(
            not isinstance(text, str) or not 1 <= len(text.encode("utf-8")) <= 512
            for text in sequences
        ):
            raise ValueError("model.stop 必须是一个停止字符串或最多 16 项的列表，每项 1–512 字节")
        options["stop"] = stop
    return options


def validate_question(value: object, limit: int) -> str:
    """Return a stripped nonblank Unicode question up to limit characters, or raise ValueError."""
    if not isinstance(value, str) or not (question := value.strip()):
        raise ValueError("请输入问题")
    if len(question) > limit:
        raise ValueError(f"问题长度不能超过 {limit} 个字符")
    try:
        question.encode("utf-8")
    except UnicodeEncodeError as error:
        raise ValueError("问题含有无效的 Unicode 字符") from error
    return question
