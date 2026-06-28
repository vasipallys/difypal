import type { DifyDsl } from '@/shared/types/dsl'

export function generateTestPlan(dsl: DifyDsl): string {
  const nodes = dsl.workflow?.graph.nodes ?? []
  const start = nodes.find(node => node.data.type === 'start')
  const inputVariables = (start?.data.variables as Array<Record<string, unknown>> | undefined) ?? []
  const hasExternal = nodes.some(node => ['llm', 'tool', 'http-request', 'knowledge-retrieval', 'agent', 'agent-v2'].includes(node.data.type))
  const hasHuman = nodes.some(node => node.data.type === 'human-input')

  return `# Test suite: ${dsl.app.name}

## DSL integrity

- [ ] YAML parses with duplicate-key rejection.
- [ ] \`version\`, \`kind\`, \`app\`, and mode-specific configuration are present.
- [ ] Exported YAML round-trips without structural loss.
- [ ] Target Dify instance accepts the import.
- [ ] Plugin/model/knowledge dependencies resolve in the target workspace.

## Graph integrity

- [ ] Exactly one start node exists.
- [ ] Node and edge IDs are unique.
- [ ] Every edge endpoint exists.
- [ ] Every executable node is reachable.
- [ ] Every path terminates in ${dsl.app.mode === 'advanced-chat' ? 'an answer node' : 'an end node'}.
- [ ] Branch handles map to declared cases.
- [ ] Iteration/loop container references are internally consistent.

## Input cases

${inputVariables.map(variable => `- [ ] \`${String(variable.variable)}\`: required=${String(variable.required ?? false)}, type=${String(variable.type ?? 'unknown')} — valid, empty, invalid, and boundary values.`).join('\n') || '- [ ] Run with no explicit start variables.'}

## Functional cases

- [ ] Golden path produces the expected output contract.
- [ ] Empty and missing required input fail clearly.
- [ ] Long input respects configured limits.
- [ ] Invalid type is rejected.
${hasExternal ? '- [ ] Each external/model/tool/retrieval dependency is tested for refusal, timeout, rate limit, and unavailable-provider behavior.' : ''}
${hasHuman ? '- [ ] Human approval accepted, rejected, and timed out paths terminate correctly.' : ''}

## Simulation fixtures

Use a mock-output object keyed by node ID:

\`\`\`json
${JSON.stringify(Object.fromEntries(nodes.filter(node => ['llm', 'tool', 'http-request', 'knowledge-retrieval', 'agent', 'code'].includes(node.data.type)).map(node => [node.id, { text: `Mock output for ${node.data.title ?? node.id}` }])), null, 2)}
\`\`\`

## Security

- [ ] No API key, bearer token, password, credential ID, or secret value is exported.
- [ ] Logs and generated documentation redact secrets.
- [ ] External AI and real Dify runs show a data preview and require approval.
- [ ] Code nodes remain inert during local simulation.
`
}
