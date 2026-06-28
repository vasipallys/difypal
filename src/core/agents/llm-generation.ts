import type { AppMode } from '@/shared/types/dsl'

export function buildDslGenerationPrompt(
  requirement: string,
  appType: Extract<AppMode, 'workflow' | 'advanced-chat'>,
  baselineDsl: string,
): string {
  return `You are a Dify DSL architect. Return one complete Dify app DSL YAML document and nothing else.

Target compatibility:
- Dify app DSL version must be the quoted string "0.6.0".
- Top-level keys must include version, kind: app, app, dependencies, and workflow.
- app.mode must be ${appType}.
- workflow.graph must contain nodes, edges, and viewport.
- Exactly one start node is required.
- A workflow must terminate in an end node. An advanced-chat app must terminate in an answer node.
- Every node requires a unique string id and data.type.
- Every edge requires a unique id, source, target, sourceHandle, targetHandle, type: custom, and data.sourceType/targetType.
- Variable selectors use YAML arrays: [node-id, output-name].
- Prompt references use {{#node-id.output-name#}}.
- Do not include API keys, bearer tokens, passwords, credential IDs, or secret values.
- Keep model/provider, plugin, tool, and knowledge references editable and portable. Do not invent workspace IDs.
- Preserve required node fields and valid execution paths.

User requirement:
${requirement.trim()}

Start from this structurally valid baseline and enhance it only where the requirement needs it:

${baselineDsl}

Output raw YAML only. Do not use Markdown fences and do not explain your reasoning.`
}

export function extractDslFromModelResponse(response: string): string {
  const trimmed = response.trim()
  const fenced = /```(?:yaml|yml)?\s*([\s\S]*?)```/i.exec(trimmed)
  if (fenced?.[1])
    return fenced[1].trim()

  const startCandidates = [
    trimmed.indexOf('version:'),
    trimmed.indexOf('"version":'),
  ].filter(index => index >= 0)
  if (startCandidates.length) {
    const start = Math.min(...startCandidates)
    return trimmed.slice(start).trim()
  }
  return trimmed
}
