# Cyber Yi · 赛博周易

[中文](README_CN.md)

Cyber Yi is a frontend-only TypeScript application for three-coin Zhouyi readings. It displays the primary hexagram, moving lines and changed hexagram, selects passages from a local corpus, and optionally interprets a question through a user-configured OpenAI-compatible service. The Python package, Python web server and CLI have been removed.

## Run

Use Node.js 24 LTS (24.15+) and npm from the repository root:

```sh
npm ci
npm run dev
```

Open the local URL printed in the terminal. Stop the development server with `Ctrl+C`. Node.js is needed for development and builds; the deployed website needs neither a Node.js nor a Python backend.

```sh
npm test
npm run build
npm run preview
```

Tests cover known examples, all 4,096 line-value combinations, configuration validation, mocked model streams and the bundled page in a simulated DOM. The build runs strict TypeScript checking and creates `dist/`. Deploy that directory to a static host. Relative asset paths support subdirectory hosting. Use HTTPS in production; localhost/127.0.0.1 works for local development. Access the app through HTTP(S), rather than opening the HTML file directly.

## Use

1. Enter a question and cast six lines. Values are generated bottom to top; the diagram shows the upper line at the top.
2. Read the primary figure, moving lines, changed figure and cited passages with commentary. No changed figure appears when no lines move.
3. Optionally expand the model settings, enter an API root, model identifier and your own API key, then request an interpretation.

Casting and corpus lookup run locally in the browser without model requests. The corpus is bundled at build time. Once the page loads, casting and lookup work without a network connection. There is no Service Worker, so opening or reloading the page while offline is not guaranteed.

The corpus includes 450 canonical passages plus Tuan, Great Image and line-image commentaries. [JSONL corpus](data/zhouyi.jsonl). Interpretations are intended for cultural exploration and personal reflection.

## Connect a model

Enter an API root such as `https://api.example.com/v1`; the app appends `/chat/completions`. The service must support streaming Chat Completions. Remote endpoints require HTTPS; loopback services may use HTTP. The provider must allow the browser origin, POST, and the `Authorization` and `Content-Type` headers through CORS. Compatibility must be checked against the actual endpoint; the app cannot bypass a provider's CORS policy.

The page shows the destination before a request. Only clicking the interpretation button sends the original question and selected evidence to that endpoint. Settings and credentials remain in page memory: no localStorage, sessionStorage, cookies or `.env` storage. Reloading clears them, and a button clears the key immediately. Never place a shared key in source, YAML or frontend build environment variables: static assets are public. No model proxy is included.

[config/settings.yaml](config/settings.yaml) controls question length, optional endpoint/model defaults, the total request deadline and generation parameters. Page inputs override endpoint/model defaults. `generation` defaults to an empty object; configure `max_tokens`, `max_completion_tokens`, `temperature`, `top_p`, `stop`, `reasoning_effort` or `thinking` as supported by your provider. Compatible services may accept different fields. Rebuild after changing configuration.

Edit `system` and `user` in [config/prompts.yaml](config/prompts.yaml), keeping the `{{ question }}`, `{{ cast }}` and `{{ passages }}` placeholders. Thinking and answer text stream into separate Markdown sections; raw HTML is displayed as text.

Model failures preserve the cast and passages. Retry uses the original question and six line values; requests are never retried automatically. Editing the question requires a fresh cast before interpretation.

## Design

- [Casting and passage selection](docs/divination.md)
- [Corpus, sources and preparation](docs/corpus.md)
- [Frontend architecture, model integration and interface](docs/architecture.md)
- [Repository collaboration instructions](AGENTS.md)
