# Cyber Yi · 赛博周易

[English](README.md)

Cyber Yi 是一个纯前端 TypeScript 应用。它用三钱法生成六爻，展示本卦、动爻与之卦，从本地《周易》语料取辞，并可通过使用者配置的 OpenAI 兼容服务结合问题给出解读。Python 包、本机 Python 服务和 CLI 已移除。

## 运行

使用 Node.js 24 LTS (24.15+) 和 npm，在仓库根目录执行：

```sh
npm ci
npm run dev
```

打开终端显示的本机地址，按 `Ctrl+C` 停止开发服务。开发与构建使用 Node.js；部署后的网页不需要 Node.js 或 Python 服务。

```sh
npm test
npm run build
npm run preview
```

`npm test` 运行固定卦例、全部 4,096 种爻值组合、配置校验、模拟流式模型测试与打包页面的 DOM 集成测试。`npm run build` 先做严格 TypeScript 类型检查，再生成 `dist/`。将 `dist/` 部署到任意静态托管服务即可；资源使用相对路径，支持子目录部署。生产部署使用 HTTPS，本机开发可用 localhost/127.0.0.1。请通过 HTTP(S) 访问，不要直接双击 HTML 文件。

## 使用流程

1. 输入问题，点击「三钱起卦」。六爻按初爻到上爻生成，卦画以上爻在顶部显示。
2. 查看本卦、动爻、之卦及附有出处的经传，无动爻时只显示本卦。
3. 按需展开「模型配置」，填写 API 根地址、模型名称和自己的 API Key，再点击「请求模型解读」。

起卦和查经在浏览器本地完成，无需模型请求。语料在构建时随应用打包；页面加载完成后可以断网起卦和查经。当前没有 Service Worker，不保证断网后的首次打开或刷新可用。

语料包含 450 段经文，另附彖传、大象和小象。[JSONL 语料](data/zhouyi.jsonl) · 解读用于传统文化体验和自我反思。

## 连接模型

API 根地址例如 `https://api.example.com/v1`，程序会追加 `/chat/completions`。使用支持流式 Chat Completions 的服务；远程地址须为 HTTPS，本机服务可使用 HTTP。服务商必须允许浏览器来源、POST 及 `Authorization`、`Content-Type` 请求头的 CORS 请求。是否兼容需在实际端点验证；应用无法绕过服务商的跨域限制。

页面在请求前显示发送端点。只有点击解读后，原问题和选出的经传才会发往该端点。配置和密钥只存在当前页面内存，不写入 localStorage、sessionStorage、Cookie 或 `.env`，刷新后清除；也可点击「清除密钥」。不要将共享密钥放入源码、YAML 或前端构建环境变量，静态产物对访客可见。没有内置模型代理。

[config/settings.yaml](config/settings.yaml) 管理问题长度、可选端点/模型默认值、请求总超时和生成参数；页面输入覆盖端点与模型默认值。`generation` 默认为空，请根据服务商需要设置 `max_tokens`、`max_completion_tokens`、`temperature`、`top_p`、`stop`、`reasoning_effort` 或 `thinking`。兼容服务支持的字段不一定相同。配置修改后需重新构建。

[config/prompts.yaml](config/prompts.yaml) 中的 `system`、`user` 可修改。用户提示保留 `{{ question }}`、`{{ cast }}` 和 `{{ passages }}` 三种占位符。模型分别流式返回思考过程和解读正文，支持 Markdown，原始 HTML 按文本展示。

模型失败时仍保留原卦与经文。点击「用原卦重试解读」复用原问题与六个爻值，不自动重试请求。编辑问题后需重新起卦，避免将旧卦用于新问题。

## 设计文档

- [三钱起卦与《周易》取辞](docs/divination.md)
- [本地语料、底本和整理方法](docs/corpus.md)
- [纯前端架构、模型接入和交互界面](docs/architecture.md)
- [仓库协作说明](AGENTS.md)
