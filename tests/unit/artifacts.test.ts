import { describe, expect, it } from 'vitest'
import { runOfflinePipeline } from '@/core/agents/pipeline'

describe('offline agent pipeline', () => {
  it('produces DSL, docs, tests, and visible decision summaries', () => {
    const output = runOfflinePipeline('Summarize a customer message without inventing facts.', 'advanced-chat')
    expect(output.validation.valid).toBe(true)
    expect(output.dsl).toContain('mode: advanced-chat')
    expect(output.documentation).toContain('# Summarize a customer message')
    expect(output.tests).toContain('## DSL integrity')
    expect(output.planSummary.length).toBeGreaterThan(2)
    expect(output.requiredApprovals).toContain('Final DSL export')
  })
})
