# Dify DSL Studio

**Local AI-powered editor, debugger, runner, visualizer, and test generator for Dify DSL workflows**

Dify DSL Studio is an offline-first Electron desktop application for creating,
editing, validating, visualizing, documenting, testing, and safely simulating
Dify app DSL. It can optionally call configured AI providers or run a published
workflow through a Dify Application API, but neither is required for local work.

The compatibility profile in this repository is derived from official Dify
commit `7a111c22260bf41af38a1452a34a7b2cd16668e3` and its pinned
`graphon==0.5.3` runtime. The current app DSL version at that commit is `0.6.0`.
See [Dify compatibility](docs/dify-compatibility.md) for evidence and caveats.

## What works

- Requirement-to-DSL generation without an external model
- Strict YAML parsing with duplicate-key rejection
- Dify schema, version, graph, variable, security, and prompt checks
- Monaco YAML editor and React Flow graph
- Safe local simulation with explicit mocks and node trace
- Standalone execution through official Graphon `0.5.3`, without Dify's
  PostgreSQL, Redis, Celery, Flask API, or web server
- Markdown documentation and test-plan generation
- Local SQLite project/history storage
- OS-encrypted AI and Dify credentials through Electron `safeStorage`
- First-class OpenAI, Groq, Claude, Gemini, Kimi, Ollama, LM Studio, and
  custom OpenAI-compatible/local adapters
- Optional approved Dify Application API workflow runs
- Human approval queue for protected actions
- Unit and Electron Playwright smoke tests

## Quick start

Requirements:

- Node.js 22 or newer
- npm 10 or newer
- Python 3.12 or 3.13 plus `uv` for the optional standalone Graphon runtime

```bash
npm install
npm run runtime:setup
npm run dev
```

The development command starts Vite, compiles the secure Electron main/preload
processes, and opens the desktop window.

Production-like local run:

```bash
npm run build
npm start
```

## Commands

```bash
npm run typecheck   # strict TypeScript check
npm test            # Vitest unit tests
npm run test:e2e    # build and run the real Electron Playwright smoke test
npm run check       # typecheck, unit tests, production build
npm run runtime:setup # install pinned Graphon 0.5.3 sidecar
npm run runtime:test  # test the Python runtime bridge
npm run package     # platform installer via electron-builder
npm run package:dir # unpacked application directory
```

Packaging outputs go to `release/`. Build Windows on Windows, macOS on macOS,
and Linux on Linux for predictable native signing and installer behavior.

## First workflow

1. Select **New from requirement**.
2. Describe inputs, output, tools, knowledge, approvals, and error paths.
3. Choose the built-in local architect or a saved AI profile. For a saved
   profile, Studio loads its configured model and OS-encrypted key only in the
   Electron main process after approval.
4. Generate the draft.
5. Review **DSL Editor**, **Visual Workflow**, and **Validation**.
6. Use **Debugger** in Simulation mode for inert mocks, **Graphon** mode for
   standalone execution, or Dify API mode for a published app.
7. Generate **Documentation** and **Test Cases**.
8. Click **Export DSL**, approve the request in **AI Review**, then export.

Uploaded YAML is treated as untrusted. Code nodes are never executed locally.

## Architecture

```text
Electron main
├── secure IPC allowlist
├── file dialogs and exports
├── SQLite projects / profiles / approvals
├── OS-backed credential encryption
└── approved Dify API runner

React renderer
├── requirement pipeline
├── Monaco editor
├── React Flow graph and inspector
├── validator / simulator / docs / tests
├── settings
└── approval queue

Pure TypeScript core
├── DSL parser and compatibility adapter
├── graph / variable / security / prompt validation
├── safe simulator
├── provider abstraction
└── artifact generators
```

The renderer cannot access Node.js directly. `contextIsolation`, sandboxing,
disabled `nodeIntegration`, a restrictive preload bridge, CSP, URL denial, and
secret redaction are enabled. More detail is in
[architecture](docs/architecture.md) and [security](docs/security.md).

## Local data

Electron stores data below the operating system's application-data directory:

```text
Dify DSL Studio/
  workspace/
    studio.sqlite
```

Projects remain local. API keys are stored as ciphertext only when the OS
encryption service is available. `.env.local` is ignored and intended only for
non-secret development defaults.

## Known limitations

- Simulation is not Dify runtime equivalence; use Graphon mode when real local
  traversal is required.
- Standalone Graphon executes its supported built-ins. Plugin tools, knowledge
  retrieval, sandboxed code, uploaded files, and resumable human-input flows
  still need their Dify/Slim service dependencies and fail explicitly.
- The source-derived validator covers structural contracts and high-value
  node requirements. Dify node DTOs permit compatibility extras, and plugin
  schemas can evolve independently.
- The deterministic requirement generator creates a safe start → LLM →
  end/answer baseline. Complex tool, RAG, loop, and human-input designs should
  be added through reviewed edits or an approved external model.
- Standalone `agent` apps and RAG pipeline DSL use separate services/runtimes;
  they are reported as inspect-only or compatibility warnings.
- Knowledge dataset identifiers and plugin/model availability are
  workspace-specific. Only the target Dify instance can prove final import and
  runtime compatibility.
- PDF documentation export is not bundled; Markdown and HTML are supported.
- Streaming provider adapters currently expose a compatible async interface but
  use a buffered fallback. Dify runs use blocking mode for reliable redaction.

## Future enhancements

- Source-generated JSON Schema and Monaco completion for every node revision
- Graph-to-YAML editing with transactional diffs
- Plugin manifest discovery and credential-slot mapping
- Streaming Dify traces, breakpoints, and resumable human-input forms
- Signed auto-update and platform code-signing pipelines
- HTML/PDF documentation rendering

## Source provenance

- [Official Dify repository](https://github.com/langgenius/dify)
- [Official Graphon runtime](https://github.com/langgenius/graphon)
- [Pinned AppDslService source](https://github.com/langgenius/dify/blob/7a111c22260bf41af38a1452a34a7b2cd16668e3/api/services/app_dsl_service.py)
- [Dify Run Workflow API](https://docs.dify.ai/api-reference/workflows/run-workflow)
- [Playwright Electron API](https://playwright.dev/docs/api/class-electron)

No Dify source code is copied into the application. Compatibility facts and
test samples are re-expressed as independent TypeScript validation behavior.
