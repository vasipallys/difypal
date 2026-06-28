# Local setup

## Development

```bash
git clone <this repository>
cd difypal
npm install
npm run dev
```

`npm run dev` starts:

1. Vite on `127.0.0.1:5173`
2. tsup in watch mode for main/preload
3. Electron after both outputs are ready

The development CSP allows only the local Vite server and its WebSocket in
addition to normal configured HTTP/HTTPS calls.

## Quality checks

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

The E2E test launches the installed Electron binary with a temporary DevTools
port, connects Playwright over CDP, and drives the actual desktop renderer.

## Configuration

Create profiles in the UI. Do not put API keys in `.env.local`.

AI provider examples:

- Ollama: `http://127.0.0.1:11434`
- OpenAI: `https://api.openai.com/v1`
- Groq: `https://api.groq.com/openai/v1`
- Gemini: `https://generativelanguage.googleapis.com/v1beta`
- Anthropic: `https://api.anthropic.com/v1`
- Kimi: `https://api.moonshot.ai/v1`
- LM Studio: `http://127.0.0.1:1234/v1`
- Ollama: `http://127.0.0.1:11434`
- llama.cpp, vLLM, LocalAI, Qwen-compatible servers, and other local endpoints:
  provider type `openai-compatible` with the server's `/v1` base URL

For Dify, use the Application API base URL, commonly ending in `/v1`, and an
app API key. The public workflow endpoint is `POST /workflows/run`.

## Packaging

```bash
npm run package
```

For distribution:

- set platform icons in Electron Builder configuration
- configure Apple signing/notarization on macOS
- configure Authenticode signing on Windows
- publish checksums with installers

Unsigned development packages will trigger normal operating-system warnings.
