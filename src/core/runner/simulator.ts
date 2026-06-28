import type { DifyDsl, DifyEdge, DifyNode, SimulationResult, TraceStep } from '@/shared/types/dsl'
import { parseDsl } from '@/core/dsl/parser'
import { validateDsl } from '@/core/validation/validator'

type Pool = Record<string, unknown>

function getValue(pool: Pool, selector: unknown): unknown {
  if (!Array.isArray(selector) || selector.some(part => typeof part !== 'string'))
    return undefined
  const [source, ...path] = selector as string[]
  let value = pool[source]
  for (const key of path) {
    if (!value || typeof value !== 'object')
      return undefined
    value = (value as Record<string, unknown>)[key]
  }
  return value
}

function interpolate(template: string, pool: Pool): string {
  return template.replace(/\{\{#([^#]+)#\}\}/g, (_whole, reference: string) => {
    const value = getValue(pool, reference.split('.'))
    if (value === undefined || value === null)
      return ''
    return typeof value === 'string' ? value : JSON.stringify(value)
  })
}

function resolveValue(value: unknown, pool: Pool): unknown {
  if (Array.isArray(value) && value.every(item => typeof item === 'string'))
    return getValue(pool, value)
  if (typeof value === 'string')
    return interpolate(value, pool)
  return value
}

function evaluateCondition(condition: Record<string, unknown>, pool: Pool): boolean {
  const actual = getValue(pool, condition.variable_selector)
  const expected = resolveValue(condition.value, pool)
  switch (condition.comparison_operator) {
    case 'is':
    case '=':
    case 'equal':
      return actual === expected
    case 'is not':
    case 'not equal':
    case '!=':
      return actual !== expected
    case 'contains':
      return String(actual ?? '').includes(String(expected ?? ''))
    case 'not contains':
      return !String(actual ?? '').includes(String(expected ?? ''))
    case 'empty':
      return actual === '' || actual === null || actual === undefined
    case 'not empty':
      return actual !== '' && actual !== null && actual !== undefined
    case '>':
      return Number(actual) > Number(expected)
    case '>=':
      return Number(actual) >= Number(expected)
    case '<':
      return Number(actual) < Number(expected)
    case '<=':
      return Number(actual) <= Number(expected)
    default:
      return false
  }
}

function branchFor(node: DifyNode, pool: Pool): string {
  const cases = Array.isArray(node.data.cases) ? node.data.cases as Array<Record<string, unknown>> : []
  for (const item of cases) {
    const conditions = Array.isArray(item.conditions) ? item.conditions as Array<Record<string, unknown>> : []
    const operator = item.logical_operator === 'or' ? 'or' : 'and'
    const matched = operator === 'or'
      ? conditions.some(condition => evaluateCondition(condition, pool))
      : conditions.every(condition => evaluateCondition(condition, pool))
    if (matched)
      return String(item.case_id ?? item.id ?? 'true')
  }
  const legacy = Array.isArray(node.data.conditions) ? node.data.conditions as Array<Record<string, unknown>> : []
  if (legacy.length) {
    const matched = node.data.logical_operator === 'or'
      ? legacy.some(condition => evaluateCondition(condition, pool))
      : legacy.every(condition => evaluateCondition(condition, pool))
    return matched ? 'true' : 'false'
  }
  return 'false'
}

function outputMap(node: DifyNode, pool: Pool, inputs: Record<string, unknown>, mocks: Record<string, unknown>): {
  status: TraceStep['status']
  outputs: Record<string, unknown>
  message?: string
  branch?: string
} {
  switch (node.data.type) {
    case 'start':
      return { status: 'succeeded', outputs: inputs }
    case 'end': {
      const outputs: Record<string, unknown> = {}
      for (const entry of (node.data.outputs as Array<Record<string, unknown>> | undefined) ?? [])
        outputs[String(entry.variable)] = getValue(pool, entry.value_selector)
      return { status: 'succeeded', outputs }
    }
    case 'answer':
      return { status: 'succeeded', outputs: { answer: interpolate(String(node.data.answer ?? ''), pool) } }
    case 'template-transform':
      return { status: 'succeeded', outputs: { output: interpolate(String(node.data.template ?? ''), pool) } }
    case 'if-else':
      return { status: 'succeeded', outputs: {}, branch: branchFor(node, pool) }
    case 'human-input':
      return { status: 'paused', outputs: {}, message: 'Simulation paused at the human approval/input node.' }
    case 'code':
      return {
        status: 'mocked',
        outputs: (mocks[node.id] as Record<string, unknown> | undefined) ?? {},
        message: 'Code is never executed by the safe simulator; supplied mock output was used.',
      }
    case 'llm':
    case 'tool':
    case 'http-request':
    case 'knowledge-retrieval':
    case 'agent':
    case 'agent-v2':
    case 'parameter-extractor':
    case 'question-classifier':
    case 'datasource':
      return {
        status: 'mocked',
        outputs: (mocks[node.id] as Record<string, unknown> | undefined) ?? {
          text: `[Mocked ${node.data.type} output]`,
        },
        message: 'External/non-deterministic node mocked in local simulation.',
      }
    default:
      return {
        status: 'mocked',
        outputs: (mocks[node.id] as Record<string, unknown> | undefined) ?? {},
        message: `Node type ${node.data.type} is traversed with mock outputs only.`,
      }
  }
}

function nextEdge(edges: DifyEdge[], nodeId: string, branch?: string): DifyEdge | undefined {
  const candidates = edges.filter(edge => edge.source === nodeId)
  if (branch) {
    return candidates.find(edge => edge.sourceHandle === branch)
      ?? candidates.find(edge => edge.sourceHandle === 'false')
      ?? candidates[0]
  }
  return candidates[0]
}

export function simulateDsl(
  content: string,
  inputs: Record<string, unknown> = {},
  mocks: Record<string, unknown> = {},
): SimulationResult {
  const validation = validateDsl(content)
  if (!validation.valid) {
    return {
      status: 'failed',
      outputs: {},
      trace: [],
      warnings: validation.issues.filter(item => item.severity === 'error').map(item => item.message),
    }
  }
  const dsl = parseDsl(content).document as DifyDsl
  const graph = dsl.workflow!.graph
  const nodeMap = new Map(graph.nodes.map(node => [node.id, node]))
  const start = graph.nodes.find(node => node.data.type === 'start')!
  const pool: Pool = {
    sys: { query: inputs.query ?? inputs.input ?? '', files: inputs.files ?? [] },
    env: Object.fromEntries((dsl.workflow?.environment_variables ?? []).map(variable => [variable.name, variable.value])),
    conversation: Object.fromEntries((dsl.workflow?.conversation_variables ?? []).map(variable => [variable.name, variable.value])),
  }
  const trace: TraceStep[] = []
  const warnings: string[] = []
  const visitCounts = new Map<string, number>()
  let current: DifyNode | undefined = start
  let finalOutputs: Record<string, unknown> = {}

  while (current) {
    const count = (visitCounts.get(current.id) ?? 0) + 1
    visitCounts.set(current.id, count)
    if (count > 20) {
      warnings.push(`Traversal stopped after 20 visits to node ${current.id}; loop simulation is bounded.`)
      return { status: 'failed', outputs: finalOutputs, trace, warnings }
    }

    const startedAt = new Date().toISOString()
    const nodeInputs = { ...inputs }
    const result = outputMap(current, pool, nodeInputs, mocks)
    pool[current.id] = result.outputs
    finalOutputs = result.outputs
    trace.push({
      id: `${current.id}:${trace.length}`,
      nodeId: current.id,
      nodeType: current.data.type,
      title: current.data.title ?? current.data.type,
      status: result.status,
      startedAt,
      finishedAt: new Date().toISOString(),
      inputs: nodeInputs,
      outputs: result.outputs,
      message: result.message,
    })
    if (result.status === 'paused')
      return { status: 'paused', outputs: finalOutputs, trace, warnings }
    if (['end', 'answer'].includes(current.data.type))
      break
    const edge = nextEdge(graph.edges, current.id, result.branch)
    current = edge ? nodeMap.get(edge.target) : undefined
  }

  return {
    status: 'succeeded',
    outputs: finalOutputs,
    trace,
    warnings: [
      'Simulation is structural and deterministic; it is not runtime-equivalent to Dify.',
      ...warnings,
    ],
  }
}
