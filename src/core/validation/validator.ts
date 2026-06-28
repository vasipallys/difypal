import {
  OFFICIAL_DIFY_DSL_VERSION,
  REQUIRED_NODE_FIELDS,
  SUPPORTED_NODE_TYPES,
  SYSTEM_VARIABLES,
  WORKFLOW_MODES,
} from '@/shared/constants/dify'
import type {
  DifyDsl,
  DifyNode,
  IssueCategory,
  IssueSeverity,
  ValidationIssue,
  ValidationResult,
} from '@/shared/types/dsl'
import { checkVersionCompatibility } from '@/core/dsl/compatibility'
import { parseDsl } from '@/core/dsl/parser'
import { looksLikeSecret } from '@/core/security/redaction'

const allowedNodes = new Set<string>(SUPPORTED_NODE_TYPES)

function issue(
  category: IssueCategory,
  severity: IssueSeverity,
  code: string,
  message: string,
  path?: string,
  nodeId?: string,
  suggestion?: string,
): ValidationIssue {
  return {
    id: `${category}:${code}:${path ?? nodeId ?? message}`,
    category,
    severity,
    code,
    message,
    path,
    nodeId,
    suggestion,
  }
}

function checkTopLevel(dsl: DifyDsl, issues: ValidationIssue[]): void {
  if (dsl.kind !== 'app')
    issues.push(issue('schema', 'error', 'kind', 'Top-level kind must be "app".', '/kind'))
  if (typeof dsl.version !== 'string')
    issues.push(issue('schema', 'error', 'version-type', 'Top-level version must be a quoted string.', '/version'))
  else {
    const compatibility = checkVersionCompatibility(dsl.version)
    if (compatibility.status !== 'current') {
      issues.push(issue(
        'compatibility',
        compatibility.status === 'warning' ? 'warning' : 'error',
        `version-${compatibility.status}`,
        compatibility.message,
        '/version',
      ))
    }
  }

  if (!dsl.app || typeof dsl.app !== 'object') {
    issues.push(issue('schema', 'error', 'app-missing', 'Top-level app mapping is required.', '/app'))
    return
  }
  if (!dsl.app.name)
    issues.push(issue('schema', 'error', 'app-name', 'app.name is required.', '/app/name'))
  if (!dsl.app.mode)
    issues.push(issue('schema', 'error', 'app-mode', 'app.mode is required.', '/app/mode'))

  if (WORKFLOW_MODES.includes(dsl.app.mode as (typeof WORKFLOW_MODES)[number])) {
    if (!dsl.workflow || typeof dsl.workflow !== 'object')
      issues.push(issue('schema', 'error', 'workflow-missing', `${dsl.app.mode} apps require a workflow mapping.`, '/workflow'))
  }
  else if (!dsl.model_config && ['completion', 'chat', 'agent-chat'].includes(dsl.app.mode)) {
    issues.push(issue('schema', 'error', 'model-config-missing', `${dsl.app.mode} apps require model_config.`, '/model_config'))
  }

  if (dsl.app.mode === 'agent') {
    issues.push(issue(
      'compatibility',
      'warning',
      'agent-app-separate-runtime',
      'The current AppDslService does not import the newer standalone agent app mode.',
      '/app/mode',
    ))
  }
}

function checkNodes(dsl: DifyDsl, issues: ValidationIssue[]): Map<string, DifyNode> {
  const nodes = dsl.workflow?.graph?.nodes
  if (!Array.isArray(nodes)) {
    issues.push(issue('schema', 'error', 'nodes', 'workflow.graph.nodes must be a list.', '/workflow/graph/nodes'))
    return new Map()
  }
  const nodeMap = new Map<string, DifyNode>()
  nodes.forEach((node, index) => {
    const path = `/workflow/graph/nodes/${index}`
    if (!node || typeof node !== 'object' || !node.id || !node.data?.type) {
      issues.push(issue('schema', 'error', 'node-shape', 'Each node requires id and data.type.', path))
      return
    }
    if (nodeMap.has(node.id))
      issues.push(issue('graph', 'error', 'duplicate-node', `Duplicate node id "${node.id}".`, `${path}/id`, node.id))
    nodeMap.set(node.id, node)
    if (!allowedNodes.has(node.data.type)) {
      issues.push(issue(
        'compatibility',
        'warning',
        'unknown-node',
        `Node type "${node.data.type}" is not in the source-derived Dify node catalog.`,
        `${path}/data/type`,
        node.id,
      ))
    }
    for (const field of REQUIRED_NODE_FIELDS[node.data.type] ?? []) {
      if (!(field in node.data)) {
        issues.push(issue(
          'schema',
          'error',
          'node-required-field',
          `${node.data.type} node requires data.${field}.`,
          `${path}/data/${field}`,
          node.id,
        ))
      }
    }
    if (node.position && (!Number.isFinite(node.position.x) || !Number.isFinite(node.position.y)))
      issues.push(issue('graph', 'error', 'position', 'Node position must contain finite x/y coordinates.', `${path}/position`, node.id))
  })
  return nodeMap
}

function checkEdges(dsl: DifyDsl, nodes: Map<string, DifyNode>, issues: ValidationIssue[]): void {
  const edges = dsl.workflow?.graph?.edges
  if (!Array.isArray(edges)) {
    issues.push(issue('schema', 'error', 'edges', 'workflow.graph.edges must be a list.', '/workflow/graph/edges'))
    return
  }
  const edgeIds = new Set<string>()
  const incoming = new Map<string, number>()
  const outgoing = new Map<string, number>()
  edges.forEach((edge, index) => {
    const path = `/workflow/graph/edges/${index}`
    if (!edge.id || !edge.source || !edge.target) {
      issues.push(issue('schema', 'error', 'edge-shape', 'Each edge requires id, source, and target.', path))
      return
    }
    if (edgeIds.has(edge.id))
      issues.push(issue('graph', 'error', 'duplicate-edge', `Duplicate edge id "${edge.id}".`, `${path}/id`))
    edgeIds.add(edge.id)
    if (!nodes.has(edge.source))
      issues.push(issue('graph', 'error', 'edge-source', `Edge source "${edge.source}" does not exist.`, `${path}/source`))
    if (!nodes.has(edge.target))
      issues.push(issue('graph', 'error', 'edge-target', `Edge target "${edge.target}" does not exist.`, `${path}/target`))
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1)
    outgoing.set(edge.source, (outgoing.get(edge.source) ?? 0) + 1)
    const sourceType = nodes.get(edge.source)?.data.type
    const targetType = nodes.get(edge.target)?.data.type
    if (edge.data?.sourceType && edge.data.sourceType !== sourceType)
      issues.push(issue('graph', 'warning', 'edge-source-type', 'edge.data.sourceType does not match its source node.', `${path}/data/sourceType`))
    if (edge.data?.targetType && edge.data.targetType !== targetType)
      issues.push(issue('graph', 'warning', 'edge-target-type', 'edge.data.targetType does not match its target node.', `${path}/data/targetType`))
  })

  const starts = [...nodes.values()].filter(node => node.data.type === 'start')
  if (starts.length !== 1)
    issues.push(issue('graph', 'error', 'start-count', `Executable workflow graphs require exactly one start node; found ${starts.length}.`, '/workflow/graph/nodes'))

  for (const node of nodes.values()) {
    if (node.data.type !== 'start' && !incoming.has(node.id))
      issues.push(issue('graph', 'warning', 'orphan-incoming', `Node "${node.data.title ?? node.id}" has no incoming edge.`, undefined, node.id))
    if (!['end', 'answer', 'loop-end'].includes(node.data.type) && !outgoing.has(node.id))
      issues.push(issue('graph', 'warning', 'dead-end', `Node "${node.data.title ?? node.id}" has no outgoing edge.`, undefined, node.id))
  }

  if (starts[0]) {
    const reachable = new Set<string>()
    const stack = [starts[0].id]
    while (stack.length) {
      const id = stack.pop()!
      if (reachable.has(id))
        continue
      reachable.add(id)
      for (const edge of edges.filter(candidate => candidate.source === id))
        stack.push(edge.target)
    }
    for (const node of nodes.values()) {
      if (!reachable.has(node.id))
        issues.push(issue('graph', 'warning', 'unreachable', `Node "${node.data.title ?? node.id}" is unreachable from start.`, undefined, node.id))
    }
  }
}

function selectors(value: unknown, path = '', selectorContext = false): Array<{ selector: string[]; path: string }> {
  const found: Array<{ selector: string[]; path: string }> = []
  if (Array.isArray(value)) {
    if (selectorContext && value.length >= 2 && value.every(item => typeof item === 'string'))
      found.push({ selector: value as string[], path })
    else value.forEach((item, index) => found.push(...selectors(item, `${path}/${index}`, false)))
  }
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (['value_selector', 'variable_selector', 'query_variable_selector', 'iterator_selector', 'output_selector', 'selector'].includes(key))
        found.push(...selectors(item, `${path}/${key}`, true))
      else
        found.push(...selectors(item, `${path}/${key}`, false))
    }
  }
  return found
}

function checkVariables(dsl: DifyDsl, nodes: Map<string, DifyNode>, issues: ValidationIssue[]): void {
  const globals = new Set([
    ...(dsl.workflow?.environment_variables ?? []).map(variable => `env.${variable.name}`),
    ...(dsl.workflow?.conversation_variables ?? []).map(variable => `conversation.${variable.name}`),
  ])
  for (const node of nodes.values()) {
    for (const entry of selectors(node.data, `/workflow/graph/nodes/${node.id}/data`)) {
      const source = entry.selector[0]
      const key = entry.selector.join('.')
      if (!source)
        continue
      if (!nodes.has(source) && !['sys', 'env', 'conversation'].includes(source)) {
        issues.push(issue('variable', 'error', 'selector-source', `Variable selector "${key}" references an unknown source node.`, entry.path, node.id))
      }
      if (source === 'sys' && !SYSTEM_VARIABLES.has(key))
        issues.push(issue('variable', 'warning', 'system-variable', `System variable "${key}" is not in the current source-derived catalog.`, entry.path, node.id))
      if (['env', 'conversation'].includes(source) && !globals.has(key))
        issues.push(issue('variable', 'error', 'global-variable', `Global variable "${key}" is not declared.`, entry.path, node.id))
    }

    const serialized = JSON.stringify(node.data)
    for (const match of serialized.matchAll(/\{\{#([^#]+)#\}\}/g)) {
      const reference = match[1]
      const source = reference.split('.')[0]
      if (!nodes.has(source) && !['sys', 'env', 'conversation'].includes(source))
        issues.push(issue('variable', 'error', 'template-reference', `Template reference "${reference}" has an unknown source.`, undefined, node.id))
    }
  }
}

function checkSecurityAndPrompts(dsl: DifyDsl, issues: ValidationIssue[]): void {
  const visit = (value: unknown, path: string, key = ''): void => {
    if (typeof value === 'string') {
      if (looksLikeSecret(value) && !/icon|description|prompt/i.test(key))
        issues.push(issue('security', 'error', 'embedded-secret', 'Possible hardcoded secret detected. Move it to an environment secret.', path))
      return
    }
    if (Array.isArray(value))
      value.forEach((item, index) => visit(item, `${path}/${index}`, key))
    else if (value && typeof value === 'object')
      Object.entries(value as Record<string, unknown>).forEach(([childKey, item]) => visit(item, `${path}/${childKey}`, childKey))
  }
  visit(dsl, '')

  for (const [index, node] of (dsl.workflow?.graph?.nodes ?? []).entries()) {
    if (node.data.type !== 'llm')
      continue
    const prompt = JSON.stringify(node.data.prompt_template ?? '')
    const path = `/workflow/graph/nodes/${index}/data/prompt_template`
    if (prompt.length < 60)
      issues.push(issue('prompt', 'warning', 'prompt-too-short', 'LLM prompt may be too broad; define role, task, constraints, and output format.', path, node.id))
    if (!/output|format|json|respond/i.test(prompt))
      issues.push(issue('prompt', 'info', 'output-format', 'Prompt does not state an explicit output format.', path, node.id))
    if (!/if .*not|unknown|insufficient|refus|do not (invent|guess)|guardrail/i.test(prompt))
      issues.push(issue('prompt', 'info', 'guardrail', 'Prompt has no obvious uncertainty/refusal guardrail.', path, node.id))
  }
}

export function validateDsl(content: string): ValidationResult {
  const parsed = parseDsl(content)
  if (!parsed.document)
    return { valid: false, issues: parsed.errors }

  const issues: ValidationIssue[] = []
  checkTopLevel(parsed.document, issues)
  const nodes = checkNodes(parsed.document, issues)
  if (parsed.document.workflow)
    checkEdges(parsed.document, nodes, issues)
  checkVariables(parsed.document, nodes, issues)
  checkSecurityAndPrompts(parsed.document, issues)

  return {
    valid: !issues.some(entry => entry.severity === 'error'),
    version: typeof parsed.document.version === 'string' ? parsed.document.version : OFFICIAL_DIFY_DSL_VERSION,
    mode: parsed.document.app?.mode,
    issues,
  }
}
