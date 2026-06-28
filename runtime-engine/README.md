# Standalone Dify DSL runtime

This sidecar runs Dify workflow graphs with the official LangGenius
[`graphon`](https://github.com/langgenius/graphon) engine. Dify main commit
`7a111c22260bf41af38a1452a34a7b2cd16668e3` pins `graphon==0.5.3`; this bridge
uses the same version.

It deliberately excludes Dify's Flask API, SQLAlchemy models, PostgreSQL,
Redis, Celery, and web application. Electron sends one secret-redacted JSON
request over standard input and receives one JSON result over standard output.
API keys remain in the Electron main process until the approved run starts.

## Setup

Requirements: Python 3.12 or 3.13 and `uv`.

```powershell
npm run runtime:setup
npm run runtime:test
```

## Runtime coverage

Graphon supplies graph parsing, validation, traversal, variables, branching,
loops, iterations, templates, HTTP nodes, node results, and graph events.
Studio supplies a text-only model adapter for OpenAI, Groq, Claude, Gemini,
Kimi, Ollama, LM Studio, and OpenAI-compatible profiles.

Dify plugin tools, knowledge retrieval, sandboxed code execution, uploaded
files, and resumable human-input workflows still require their corresponding
Dify services or official Slim integrations. They fail explicitly rather than
silently falling back to simulation.

Graphon is Apache-2.0 licensed. No Graphon source is copied into this project;
it is consumed as the pinned Python dependency.
