# Cyber Yi · 赛博周易

[English](README.md)

Cyber Yi 是一个用于体验周易占筮的 Python 包。它用三钱法生成六爻，展示卦象和动爻，从本地《周易》语料取辞，并可通过 OpenAI 兼容模型结合问题给出解读。

## 使用流程

1. 输入问题，自下而上起六爻。
2. 查看本卦、动爻、之卦，以及附有出处的相关经文。无动爻时只显示本卦。
3. 按需请求模型解读。起卦和查经可以离线完成。

CLI 与本机网页共用同一套起卦和取辞逻辑。解读用于传统文化体验和自我反思。

## 运行

在仓库根目录使用 Python 3.13 及以上版本和 `uv`。

```sh
uv sync
uv run cyber-yi cast "我该如何准备接下来的面谈？"
uv run cyber-yi cast --lines 9 7 7 7 7 7 --json
uv run cyber-yi serve
```

打开服务启动时打印的本机地址。在同一个终端按 `Ctrl+C` 停止服务。离线模式可以起卦、查经和浏览卦画。`--lines` 按初爻到上爻复用一次起卦，`--json` 输出结构化结果。语料包含 450 段经文，另附彖传、大象和小象。[JSONL 语料](data/zhouyi.jsonl)

## 连接模型

在 [config/settings.yaml](config/settings.yaml) 填写 `model.base_url` 和 `model.name`，将 [.env.example](.env.example) 复制为 `.env` 后填写对应的 `OPENAI_API_KEY`。网页上点击「请求模型解读」，或在命令行用 `--interpret`。

当前配置发送 `max_completion_tokens: 16384`。这是 OpenAI Chat Completions 的输出上限字段，包含推理 token。DeepSeek 文档列出的上限字段是 `max_tokens`，当前配置的上限能否在 DeepSeek 生效尚待验证。[OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) · [DeepSeek Chat Completions](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion/)

DeepSeek 将 `reasoning_effort: medium` 映射为 `high`。Flash 思考模式下可以用 `top_p` 调整采样。使用其他兼容服务时，可将 DeepSeek 扩展 `thinking` 设为 `null`。`system` 和 `user` 提示都可修改。[提示模板](config/prompts.yaml) · [DeepSeek 思考模式](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode/)

```sh
uv run cyber-yi cast "我该如何准备接下来的面谈？" --interpret
```

模型解读时，用户消息从原问题开始，接着用自然语言列出本卦、动爻和所取经传。有变卦时也会标明卦名和上下卦。网页分别流式显示思考过程和解读正文，支持 Markdown。失败后可在网页点击重试，或在 CLI 用输出的六个爻值加 `--lines` 重试。自定义配置用 `cyber-yi --config 配置路径 cast` 或 `serve`，文件中的相对路径以该配置文件所在目录为准。

运行测试用 `uv run python -m unittest discover -s tests -v`，其中 HTTP 测试需要本机环回地址。

## 设计文档

- [三钱起卦与《周易》取辞](docs/divination.md)
- [本地语料、底本和整理方法](docs/corpus.md)
- [Python 包、模型接入和交互界面](docs/architecture.md)
- [仓库协作说明](AGENTS.md)
