# Security model

## Secure defaults

- `nodeIntegration: false`
- `contextIsolation: true`
- renderer sandbox enabled
- fixed preload API; no generic IPC
- external window creation denied
- CSP applied to every renderer response
- files selected through native dialogs
- DSL import size capped at Dify's 10 MB limit

## Secrets

Credentials are never stored in project DSL or generated documentation.
Electron `safeStorage` encrypts credentials before SQLite persistence. If OS
encryption is unavailable, saving fails rather than falling back to plaintext.
During LLM generation, the renderer sends only a saved profile ID and prompt.
The Electron main process decrypts the key, loads the profile's configured
model, performs the request, and returns only model output and model name. The
decrypted key is never exposed through preload IPC.

Redaction covers:

- credential-shaped object keys
- bearer tokens
- common OpenAI, Gemini, Groq, and similar key formats

Dify-compatible export guidance mirrors upstream behavior: normal Dify export
removes tool/agent credential IDs, blanks secret environment values, clears
webhook URLs and plugin subscriptions, and may encrypt dataset IDs.

## Untrusted DSL

The YAML parser:

- rejects duplicate keys
- limits aliases
- requires a mapping
- does not construct arbitrary classes

Code nodes are never evaluated. HTTP, tool, retrieval, model, agent, datasource,
and plugin behavior is mocked in simulation.

## Approval boundaries

Explicit approval is required before:

- external AI calls
- real Dify runs
- saving a secret
- applying an AI repair
- final DSL export
- destructive overwrite/delete workflows

Approval states are pending, approved, rejected, applied, and failed. Approval
does not broaden access; the original action still validates its own inputs.

## Network

Local editing, validation, graphing, simulation, docs, tests, and project storage
need no network. Real Dify runs send only the displayed input object to the
configured Application API. Returned data is redacted before it reaches logs or
the renderer.

## Reporting

Do not attach DSL or databases containing private prompts, environment values,
or business data to public bug reports. Reproduce with the sample workflow.
