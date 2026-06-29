import { describe, expect, it } from 'vitest'
import { generateDraftFromRequirement } from '@/core/dsl/generator'
import { proposeSafeFixes } from '@/core/dsl/fixer'
import { parseDsl, serializeDsl } from '@/core/dsl/parser'
import { validateDsl } from '@/core/validation/validator'

describe('DSL validator', () => {
  it('accepts the generated workflow draft', () => {
    const dsl = generateDraftFromRequirement('Summarize the supplied input accurately.', 'workflow')
    const result = validateDsl(dsl)
    const document = parseDsl(dsl).document!
    const llm = document.workflow!.graph.nodes.find(node => node.data.type === 'llm')!
    const prompt = llm.data.prompt_template as Array<{ role: string; text: string }>
    expect(result.valid).toBe(true)
    expect(result.version).toBe('0.6.0')
    expect(result.issues.filter(issue => issue.severity === 'error')).toEqual([])
    expect(document.workflow!.graph.nodes.every(node => /^[a-zA-Z0-9_]{1,50}$/.test(node.id))).toBe(true)
    expect(prompt.find(message => message.role === 'system')?.text).toContain('already-running Dify workflow')
    expect(prompt.find(message => message.role === 'user')?.text).toMatch(/\{\{#start_[a-z0-9]+\.input#\}\}/)
  })

  it('finds broken edge endpoints and duplicate IDs', () => {
    const dsl = generateDraftFromRequirement('Return a useful answer.', 'workflow')
      .replace(/target: end_[a-z0-9]+/, 'target: missing-node')
    const result = validateDsl(dsl)
    expect(result.issues.some(issue => issue.code === 'edge-target')).toBe(true)
  })

  it('does not treat select option arrays as variable selectors', () => {
    const dsl = generateDraftFromRequirement('Classify input.', 'workflow')
      .replace('options: []', 'options:\n            - alpha\n            - beta')
    const result = validateDsl(dsl)
    expect(result.issues.some(issue => issue.code === 'selector-source' && issue.message.includes('alpha'))).toBe(false)
  })

  it('detects embedded API keys', () => {
    const dsl = generateDraftFromRequirement('Call a service.', 'workflow')
      .replace('description: Call a service.', 'description: Call a service.\n  api_key: sk-abcdefghijklmnop')
    expect(validateDsl(dsl).issues.some(issue => issue.code === 'embedded-secret')).toBe(true)
  })

  it('proposes conservative metadata fixes without mutating node behavior', () => {
    const document = parseDsl(generateDraftFromRequirement('Echo input.', 'workflow')).document!
    delete document.dependencies
    for (const edge of document.workflow!.graph.edges)
      delete edge.sourceHandle
    const content = serializeDsl(document)
    const proposal = proposeSafeFixes(content)
    expect(proposal.changed).toBe(true)
    expect(proposal.content).toContain('dependencies: []')
    expect(proposal.content).toContain('sourceHandle: source')
    expect(validateDsl(proposal.content).valid).toBe(true)
  })
})
