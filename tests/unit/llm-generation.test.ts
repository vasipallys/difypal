import { describe, expect, it } from 'vitest'
import { buildDslGenerationPrompt, extractDslFromModelResponse } from '@/core/agents/llm-generation'

describe('LLM-backed DSL generation', () => {
  it('builds a constrained, secret-free Dify generation request', () => {
    const prompt = buildDslGenerationPrompt(
      'Summarize the input without inventing facts.',
      'workflow',
      'version: 0.6.0\nkind: app\n',
    )
    expect(prompt).toContain('app.mode must be workflow')
    expect(prompt).toContain('Do not include API keys')
    expect(prompt).toContain('Summarize the input')
    expect(prompt).toContain('version: 0.6.0')
  })

  it('extracts YAML from fenced model output', () => {
    expect(extractDslFromModelResponse('Here is the result:\n```yaml\nversion: 0.6.0\nkind: app\n```\n')).toBe(
      'version: 0.6.0\nkind: app',
    )
  })

  it('removes leading prose from an unfenced response', () => {
    expect(extractDslFromModelResponse('Generated DSL follows.\nversion: 0.6.0\nkind: app')).toBe(
      'version: 0.6.0\nkind: app',
    )
  })
})
