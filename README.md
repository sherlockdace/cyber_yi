# Cyber Yi

[简体中文](README_CN.md)

Cyber Yi is a Python package for consulting the *Zhouyi* (I Ching). It simulates the three-coin method, shows the resulting hexagram and changing lines, and retrieves the relevant passages from a local edition. An optional OpenAI-compatible model relates those passages to the user's question.

## Proposed experience

1. Enter a question and cast six lines, from the bottom up.
2. See the primary hexagram, any changing lines and resulting hexagram, and the selected passages with their sources.
3. Optionally request a model interpretation. Casting and passage lookup can run offline.

The CLI and local browser interface share the same casting and passage selection logic. Readings are intended for cultural exploration and personal reflection.

## Run locally

Run from the repository root with Python 3.13 or later and `uv`.

```sh
uv sync
uv run cyber-yi cast "How should I prepare for my next interview?"
uv run cyber-yi cast --lines 9 7 7 7 7 7 --json
uv run cyber-yi serve
```

Open the loopback URL printed by the server. Press `Ctrl+C` in the same terminal to stop the server. Casting, passage lookup and diagrams work offline. Use `--lines` to replay six bottom-to-top values and `--json` for structured output. The corpus contains 450 core passages with supporting passages from the Judgments and Images. [JSONL corpus](data/zhouyi.jsonl)

## Connect a model

Set `model.base_url` and `model.name` in [config/settings.yaml](config/settings.yaml). Copy [.env.example](.env.example) to `.env` and set `OPENAI_API_KEY` for that provider. Then click the interpretation button in the browser or use `--interpret`.

The current configuration sends `max_completion_tokens: 16384`, the OpenAI Chat Completions cap that includes reasoning tokens. DeepSeek documents its cap as `max_tokens`. Enforcement of the configured cap on DeepSeek remains unverified. [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) · [DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)

DeepSeek maps `reasoning_effort: medium` to `high`. Flash supports `top_p` for thinking-mode sampling. Set `thinking` to `null` for compatible services that lack the DeepSeek extension. Both `system` and `user` messages are editable. [Prompt templates](config/prompts.yaml) · [DeepSeek thinking mode](https://api-docs.deepseek.com/guides/thinking_mode/)

```sh
uv run cyber-yi cast "How should I prepare for my next interview?" --interpret
```

The message to the provider begins with your original question, followed by the hexagrams, moving lines, and selected passages in plain language. The web interface streams reasoning and the final answer in separate Markdown sections. If it fails, retry in the browser or supply the same question and six values with `--lines`. Pass `--config PATH` before `cast` or `serve` for a different configuration. Relative paths resolve from the configuration directory.

Run `uv run python -m unittest discover -s tests -v` to check casting, the local routes and a mock model. The HTTP tests require loopback access.

## Documentation

- [Casting and passage selection](docs/divination.md)
- [Local corpus and its sources](docs/corpus.md)
- [Architecture, model integration and interfaces](docs/architecture.md)
- [Repository guidance](AGENTS.md)
