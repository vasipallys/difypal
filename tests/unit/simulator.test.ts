import { describe, expect, it } from 'vitest'
import { generateDraftFromRequirement } from '@/core/dsl/generator'
import { parseDsl } from '@/core/dsl/parser'
import { simulateDsl } from '@/core/runner/simulator'

describe('safe simulation runner', () => {
  it('traverses start, mocked LLM, and end', () => {
    const content = generateDraftFromRequirement('Answer the user.', 'workflow')
    const document = parseDsl(content).document!
    const llm = document.workflow!.graph.nodes.find(node => node.data.type === 'llm')!
    const result = simulateDsl(content, { input: 'hello' }, { [llm.id]: { text: 'world' } })
    expect(result.status).toBe('succeeded')
    expect(result.outputs).toEqual({ result: 'world' })
    expect(result.trace.map(step => step.nodeType)).toEqual(['start', 'llm', 'end'])
    expect(result.trace[1]?.status).toBe('mocked')
  })

  it('refuses to execute structurally invalid DSL', () => {
    const result = simulateDsl('kind: app\nversion: 0.6.0\n', {}, {})
    expect(result.status).toBe('failed')
    expect(result.trace).toEqual([])
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings[0]).toMatch(/^\[[\w-]+\]/)
  })
})
