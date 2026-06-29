import { parseDsl, serializeDsl } from '@/core/dsl/parser'
import { validateDsl } from '@/core/validation/validator'
import type { DifyDsl, ValidationResult } from '@/shared/types/dsl'

export interface DslReviewPatchOperation {
  op: 'add' | 'replace' | 'remove'
  path: string
  value?: unknown
}

export interface DslReviewRecommendedChange {
  id: string
  title: string
  category: string
  rationale: string
  risk: 'low' | 'medium' | 'high'
  jsonPatch: DslReviewPatchOperation[]
  yamlSnippet?: string
}

export interface DslReviewNodeFinding {
  nodeId?: string
  nodeTitle?: string
  nodeType?: string
  status: 'ok' | 'warning' | 'critical'
  finding: string
  recommendation: string
}

export interface DslReviewReport {
  executiveSummary: string
  dslValidity: {
    status: 'valid' | 'invalid'
    reason: string
  }
  criticalIssues: string[]
  nodeByNodeReview: DslReviewNodeFinding[]
  promptImprovements: string[]
  graphEdgeIssues: string[]
  securityRisks: string[]
  costOptimizationSuggestions: string[]
  recommendedChanges: DslReviewRecommendedChange[]
  testCases: string[]
  finalImprovedDslSnippets: string[]
  reviewedAt: string
  model: string
  rawText?: string
}

function validationSummary(validation: ValidationResult): string {
  if (!validation.issues.length)
    return 'No local validation issues.'
  return validation.issues
    .map(issue => `- ${issue.severity.toUpperCase()} [${issue.category}/${issue.code}] ${issue.message}${issue.path ? ` at ${issue.path}` : ''}${issue.nodeId ? ` node=${issue.nodeId}` : ''}`)
    .join('\n')
}

export function fingerprint(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function buildDslReviewPrompt(content: string, validation: ValidationResult): string {
  return `You are a senior Dify DSL architect reviewing an uploaded Dify DSL 0.6.0 YAML file.

Use this exact agent pattern flow:
Parse → Validate → Review → Critique → Suggest → Patch → Revalidate → Report

Your job:
- Review correctness, graph topology, node configuration, prompts, security, cost, and testability.
- Prefer conservative, valid Dify DSL changes.
- Recommend specific JSON Patch operations the app can apply to the parsed YAML object.
- Do not include secrets or invent workspace-specific dataset/tool IDs.
- If you cannot safely patch something, include it as a recommendation with an empty jsonPatch array.

Return JSON only. No markdown around the JSON.

Required JSON shape:
{
  "executiveSummary": "short summary",
  "dslValidity": { "status": "valid or invalid", "reason": "why" },
  "criticalIssues": ["issue"],
  "nodeByNodeReview": [
    {
      "nodeId": "optional node id",
      "nodeTitle": "optional title",
      "nodeType": "optional type",
      "status": "ok | warning | critical",
      "finding": "what you found",
      "recommendation": "what to do"
    }
  ],
  "promptImprovements": ["suggestion"],
  "graphEdgeIssues": ["issue"],
  "securityRisks": ["risk"],
  "costOptimizationSuggestions": ["suggestion"],
  "recommendedChanges": [
    {
      "id": "stable-kebab-case-id",
      "title": "short selectable change title",
      "category": "prompt | graph | security | cost | schema | tests",
      "rationale": "why this change helps",
      "risk": "low | medium | high",
      "jsonPatch": [
        { "op": "replace", "path": "/app/description", "value": "Improved description" }
      ],
      "yamlSnippet": "optional YAML snippet showing the improved fragment"
    }
  ],
  "testCases": ["test case"],
  "finalImprovedDslSnippets": ["YAML snippets only, not the full file unless essential"]
}

JSON Patch rules:
- Paths are RFC 6901 JSON Pointers against the parsed DSL object.
- Use add, replace, and remove only.
- Use empty jsonPatch for advice that needs human configuration, credentials, real dataset IDs, or real tool IDs.
- Keep patches small and independent so users can select only the changes they want.

Local validation result:
valid: ${validation.valid}
version: ${validation.version ?? 'unknown'}
mode: ${validation.mode ?? 'unknown'}
issues:
${validationSummary(validation)}

Uploaded DSL:
\`\`\`yaml
${content}
\`\`\`
`
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = fenced?.[1] ?? text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  if (!raw.trim())
    throw new Error('AI review did not return JSON.')
  return JSON.parse(raw) as unknown
}

function arrayOfStrings(value: unknown): string[] {
  if (Array.isArray(value))
    return value.map(item => typeof item === 'string' ? item : JSON.stringify(item))
  if (typeof value === 'string' && value.trim())
    return [value]
  return []
}

function cleanStatus(value: unknown): DslReviewNodeFinding['status'] {
  return value === 'critical' || value === 'warning' || value === 'ok' ? value : 'warning'
}

function cleanRisk(value: unknown): DslReviewRecommendedChange['risk'] {
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'medium'
}

function cleanPatch(value: unknown): DslReviewPatchOperation[] {
  if (!Array.isArray(value))
    return []
  return value.flatMap((operation): DslReviewPatchOperation[] => {
    if (!operation || typeof operation !== 'object')
      return []
    const item = operation as Record<string, unknown>
    if (item.op !== 'add' && item.op !== 'replace' && item.op !== 'remove')
      return []
    if (typeof item.path !== 'string' || !item.path.startsWith('/'))
      return []
    return [{
      op: item.op,
      path: item.path,
      ...(item.op === 'remove' ? {} : { value: item.value }),
    }]
  })
}

export function parseDslReviewResponse(text: string, model: string): DslReviewReport {
  const parsed = extractJson(text)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('AI review JSON must be an object.')
  const input = parsed as Record<string, unknown>
  const validity = input.dslValidity && typeof input.dslValidity === 'object'
    ? input.dslValidity as Record<string, unknown>
    : {}
  const nodeByNodeReview = Array.isArray(input.nodeByNodeReview)
    ? input.nodeByNodeReview.flatMap((item): DslReviewNodeFinding[] => {
        if (!item || typeof item !== 'object')
          return []
        const node = item as Record<string, unknown>
        return [{
          nodeId: typeof node.nodeId === 'string' ? node.nodeId : undefined,
          nodeTitle: typeof node.nodeTitle === 'string' ? node.nodeTitle : undefined,
          nodeType: typeof node.nodeType === 'string' ? node.nodeType : undefined,
          status: cleanStatus(node.status),
          finding: String(node.finding ?? ''),
          recommendation: String(node.recommendation ?? ''),
        }]
      })
    : []
  const recommendedChanges = Array.isArray(input.recommendedChanges)
    ? input.recommendedChanges.flatMap((item, index): DslReviewRecommendedChange[] => {
        if (!item || typeof item !== 'object')
          return []
        const change = item as Record<string, unknown>
        const id = typeof change.id === 'string' && change.id.trim()
          ? change.id.trim()
          : `change-${index + 1}`
        return [{
          id,
          title: String(change.title ?? id),
          category: String(change.category ?? 'general'),
          rationale: String(change.rationale ?? ''),
          risk: cleanRisk(change.risk),
          jsonPatch: cleanPatch(change.jsonPatch),
          yamlSnippet: typeof change.yamlSnippet === 'string' ? change.yamlSnippet : undefined,
        }]
      })
    : []

  return {
    executiveSummary: String(input.executiveSummary ?? 'AI review completed.'),
    dslValidity: {
      status: validity.status === 'valid' ? 'valid' : 'invalid',
      reason: String(validity.reason ?? ''),
    },
    criticalIssues: arrayOfStrings(input.criticalIssues),
    nodeByNodeReview,
    promptImprovements: arrayOfStrings(input.promptImprovements),
    graphEdgeIssues: arrayOfStrings(input.graphEdgeIssues),
    securityRisks: arrayOfStrings(input.securityRisks),
    costOptimizationSuggestions: arrayOfStrings(input.costOptimizationSuggestions),
    recommendedChanges,
    testCases: arrayOfStrings(input.testCases),
    finalImprovedDslSnippets: arrayOfStrings(input.finalImprovedDslSnippets),
    reviewedAt: new Date().toISOString(),
    model,
    rawText: text,
  }
}

function decodePointer(path: string): string[] {
  if (!path.startsWith('/'))
    throw new Error(`Invalid JSON pointer: ${path}`)
  return path.slice(1).split('/').map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'))
}

function parentFor(root: unknown, path: string): { parent: unknown; key: string } {
  const parts = decodePointer(path)
  if (!parts.length)
    throw new Error('Cannot patch document root.')
  let parent = root
  for (const part of parts.slice(0, -1)) {
    if (!parent || typeof parent !== 'object')
      throw new Error(`Patch path does not exist: ${path}`)
    parent = Array.isArray(parent)
      ? parent[Number(part)]
      : (parent as Record<string, unknown>)[part]
  }
  return { parent, key: parts[parts.length - 1]! }
}

function applyOperation(document: DifyDsl, operation: DslReviewPatchOperation): void {
  const { parent, key } = parentFor(document, operation.path)
  if (!parent || typeof parent !== 'object')
    throw new Error(`Patch parent does not exist: ${operation.path}`)

  if (Array.isArray(parent)) {
    const index = key === '-' ? parent.length : Number(key)
    if (!Number.isInteger(index) || index < 0 || index > parent.length)
      throw new Error(`Invalid array patch index: ${operation.path}`)
    if (operation.op === 'add') {
      parent.splice(index, 0, operation.value)
      return
    }
    if (index >= parent.length)
      throw new Error(`Array patch target does not exist: ${operation.path}`)
    if (operation.op === 'replace')
      parent[index] = operation.value
    else parent.splice(index, 1)
    return
  }

  const record = parent as Record<string, unknown>
  if (operation.op === 'add') {
    record[key] = operation.value
    return
  }
  if (!(key in record))
    throw new Error(`Patch target does not exist: ${operation.path}`)
  if (operation.op === 'replace')
    record[key] = operation.value
  else delete record[key]
}

export function applyReviewChanges(content: string, changes: DslReviewRecommendedChange[]): {
  dsl: string
  document: DifyDsl
  validation: ValidationResult
} {
  const parsed = parseDsl(content)
  if (!parsed.document)
    throw new Error(parsed.errors[0]?.message ?? 'The DSL must be valid YAML before applying AI suggestions.')

  const document = structuredClone(parsed.document)
  for (const change of changes) {
    for (const operation of change.jsonPatch)
      applyOperation(document, operation)
  }
  const dsl = serializeDsl(document)
  return {
    dsl,
    document,
    validation: validateDsl(dsl),
  }
}
