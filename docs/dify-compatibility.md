# Dify compatibility report

## Baseline

| Item | Source-derived value |
|---|---|
| Dify repository | `langgenius/dify` |
| Commit | `7a111c22260bf41af38a1452a34a7b2cd16668e3` |
| Commit date | 2026-06-28 |
| App DSL version | `0.6.0` |
| Graph runtime | `graphon==0.5.3` |
| Max imported DSL size | 10 MB |

Primary upstream files inspected:

- `api/constants/dsl_version.py`
- `api/services/app_dsl_service.py`
- `api/services/dsl_version.py`
- `api/models/model.py`
- `api/models/workflow.py`
- `api/factories/variable_factory.py`
- `api/core/workflow`
- `api/core/app`
- `api/controllers/service_api/app/workflow.py`
- `api/controllers/console/app/workflow.py`
- `web/app/components/workflow/types.ts`
- `web/app/components/workflow/nodes`
- CLI app fixtures and API workflow fixtures
- Graphon 0.5.3 `dsl/importer.py`, graph validation, base DTOs, and node entities

The old path `web/app/components/base/workflow` does not exist at this commit.
Current workflow types and canvas code live under
`web/app/components/workflow`.

## Version rules

Dify uses semantic version parsing:

1. invalid version → failed
2. imported version newer than current → pending confirmation
3. imported major lower than current → pending confirmation
4. imported minor lower than current → completed with warnings
5. otherwise → completed

If version is missing, Dify's importer defaults it to `0.1.0`. Studio reports a
missing version as an error so a clean export is explicit. Dify also coerces a
missing/non-app `kind` to `app`; Studio requires `kind: app`.

## Top-level YAML

Current exported app shape:

```yaml
version: 0.6.0
kind: app
app:
  name: string
  mode: workflow
  icon: string
  icon_type: emoji
  icon_background: string
  description: string
  use_icon_as_answer_icon: false
dependencies: []
workflow: {}
```

`workflow` and `advanced-chat` use `workflow`. Legacy `completion`, `chat`, and
`agent-chat` use `model_config`. `channel` is recognized by the broader app
model but is config-only in Graphon's DSL inspector. Standalone `agent` is a
new separate runtime and is not handled by the inspected AppDslService branch.
`rag-pipeline` uses a dedicated DSL service and current Graphon import treats it
as inspect-only.

## Workflow shape

```yaml
workflow:
  graph:
    nodes: []
    edges: []
    viewport: { x: 0, y: 0, zoom: 1 }
  features: {}
  environment_variables: []
  conversation_variables: []
  rag_pipeline_variables: []
```

`Workflow.to_dict()` exports all five fields. Graph nodes are canvas objects
with top-level `id`, position metadata, and `data`. `data.type` selects the
runtime DTO. Base node data includes `type`, `title`, optional `desc`, `version`
(default `"1"`), error strategy, default values, and retry config. Compatibility
extras are permitted upstream.

## Node catalog and core required fields

The catalog combines Graphon built-ins and Dify extensions visible in current
backend/frontend source.

| Node type | Core fields beyond base data |
|---|---|
| `start` | `variables` |
| `end` | `outputs` |
| `answer` | `answer` |
| `llm` | `model`, `prompt_template`, `context`; optional memory, vision, structured output |
| `knowledge-retrieval` | query selector, dataset IDs, retrieval mode/config |
| `if-else` | modern `cases` or legacy `conditions`, logical operator |
| `question-classifier` | query selector, model, classes |
| `parameter-extractor` | model, query, parameters, reasoning mode |
| `code` | variables, language, code, outputs, optional dependencies |
| `template-transform` | variables, template |
| `http-request` | method, URL, authorization, headers, params; optional body/timeouts |
| `tool` | provider/tool identity, configuration, parameters |
| `variable-aggregator` | output type, selector groups |
| `variable-assigner` | legacy aggregator alias |
| `assigner` | version 2 operation items |
| `document-extractor` | variable selector |
| `list-operator` | variable, filters, ordering, limit, extraction |
| `iteration` | iterator selector, output selector, parallel/error options |
| `iteration-start` | base fields |
| `loop` | count, break conditions, operator, variables, outputs |
| `loop-start`, `loop-end` | base fields |
| `human-input` | content, inputs, actions, timeout; all have defaults |
| `agent`, `agent-v2` | agent configuration/parameters; Dify extension |
| `datasource` | plugin datasource entity; Dify extension |
| `knowledge-index` | index chunk selector and index configuration |
| `trigger-schedule` | trigger configuration |
| `trigger-webhook` | webhook fields; URLs cleared on export |
| `trigger-plugin` | plugin subscription; subscription ID cleared on export |

Node DTOs change faster than the outer DSL. Studio therefore validates known
required fields, preserves unknown fields, and warns rather than deleting an
unknown node type.

## Edges

Current canvas fixtures contain:

```yaml
- id: unique-string
  source: node-id
  sourceHandle: source
  target: node-id
  targetHandle: target
  type: custom
  data:
    sourceType: start
    targetType: llm
```

Graphon's importer requires string `source` and `target`, rejects unknown
endpoints and duplicate string IDs, and fills missing `data.sourceType` and
`data.targetType`. Runtime traversal defaults a missing `sourceHandle` to
`source`. Studio keeps the fuller canvas form for import-ready output.

Branch handles carry case IDs. Error fail branches use `fail-branch`; normal
success can use `success-branch`. Human-input action IDs are source handles.

## Variables

- Selectors: `["node-id", "output", "nested-key"]`
- Template form: `{{#node-id.output#}}`
- System namespace: `sys`, e.g. `{{#sys.query#}}`
- Environment namespace: `env`
- Conversation namespace: `conversation`

Start variables are defined in `start.data.variables`. Environment and
conversation variable objects include `id`, `name`, `value`, `value_type`, and
description. Environment value types include string, number, and secret.
Secret values are blanked during normal upstream export.

Studio verifies selector source existence, declared global variables, a current
system-variable allowlist, and template reference sources. Exact output path
typing remains node/plugin dependent and is reported conservatively.

## Models, knowledge, tools, and dependencies

Model references use provider, name, mode, and completion parameters. Provider
strings may include plugin path components; Graphon's standalone importer
normalizes to the final vendor segment for local runtime loading.

Knowledge nodes contain workspace-specific dataset IDs. Dify can AES-encrypt
dataset IDs using the tenant identity on export; imports into another workspace
can drop IDs that cannot be decrypted.

Tool and agent nodes can contain credential IDs, but normal export removes
them. Plugin dependencies are emitted at top level. For DSL versions through
0.1.5, Dify derives missing dependencies from the workflow graph or model
configuration.

## Import/export security behavior

Normal upstream export:

- blanks secret environment variable values
- removes tool credential IDs
- removes credentials in agent tool parameters
- resets schedule trigger configuration
- clears webhook and webhook-debug URLs
- clears plugin subscription IDs
- encrypts dataset IDs when configured

Studio never includes local provider/Dify credentials in DSL export.

## Execution APIs

Published workflow application API:

```http
POST /v1/workflows/run
Authorization: Bearer <app-api-key>
Content-Type: application/json

{
  "inputs": {},
  "response_mode": "blocking",
  "user": "dify-dsl-studio"
}
```

Dify also supports streaming, run detail/log endpoints, specific workflow IDs,
stop endpoints, and authenticated console draft/node runs. Studio uses the
public blocking application endpoint and requires approval. Draft console APIs
are intentionally not used because they require console session/RBAC context.

## Compatibility risks

- A valid outer DSL does not prove that target-workspace model/plugins exist.
- Plugin node fields and provider identifiers can evolve outside Dify core.
- Knowledge IDs are not portable by default.
- Newer node DTO versions may add required fields while retaining the same outer
  DSL version.
- Graphon local loading supports only a subset of Dify app modes and nodes.
- Cycles are meaningful inside loop containers but unsafe as arbitrary graph
  cycles; Studio bounds simulation visits rather than claiming full equivalence.
- Final compatibility must be tested by importing into the intended Dify
  instance.
