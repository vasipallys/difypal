import { describe, expect, it } from 'vitest'
import {
  applyReviewChanges,
  buildDslReviewPrompt,
  parseDslReviewResponse,
} from '@/core/agents/dsl-review'
import { createStarterDsl } from '@/core/dsl/starter-templates'
import { validateDsl } from '@/core/validation/validator'

describe('AI DSL review helpers', () => {
  it('builds a review prompt with the required agent flow and report sections', () => {
    const starter = createStarterDsl('basic-llm')
    const prompt = buildDslReviewPrompt(starter.dsl, validateDsl(starter.dsl))

    expect(prompt).toContain('Parse → Validate → Review → Critique → Suggest → Patch → Revalidate → Report')
    expect(prompt).toContain('"executiveSummary"')
    expect(prompt).toContain('"recommendedChanges"')
    expect(prompt).toContain('Uploaded DSL:')
  })

  it('parses fenced review JSON and normalizes patchable suggestions', () => {
    const report = parseDslReviewResponse(`Here is JSON:
\`\`\`json
{
  "executiveSummary": "Good base workflow.",
  "dslValidity": { "status": "valid", "reason": "No blocking errors." },
  "criticalIssues": [],
  "nodeByNodeReview": [{ "nodeId": "llm", "status": "warning", "finding": "Prompt is broad.", "recommendation": "Add output rules." }],
  "promptImprovements": ["Add refusal guidance."],
  "graphEdgeIssues": [],
  "securityRisks": [],
  "costOptimizationSuggestions": ["Lower temperature."],
  "recommendedChanges": [{
    "id": "improve-description",
    "title": "Improve description",
    "category": "schema",
    "rationale": "Clearer metadata.",
    "risk": "low",
    "jsonPatch": [{ "op": "replace", "path": "/app/description", "value": "Improved description" }]
  }],
  "testCases": ["Golden path"],
  "finalImprovedDslSnippets": ["app:\\n  description: Improved description"]
}
\`\`\``, 'test-model')

    expect(report.dslValidity.status).toBe('valid')
    expect(report.recommendedChanges[0]?.jsonPatch[0]?.path).toBe('/app/description')
    expect(report.nodeByNodeReview[0]?.status).toBe('warning')
  })

  it('applies selected JSON Patch suggestions and revalidates the DSL', () => {
    const starter = createStarterDsl('blank-workflow')
    const result = applyReviewChanges(starter.dsl, [{
      id: 'description',
      title: 'Improve description',
      category: 'schema',
      rationale: 'Make the uploaded DSL easier to understand.',
      risk: 'low',
      jsonPatch: [{ op: 'replace', path: '/app/description', value: 'Reviewed and improved workflow.' }],
    }])

    expect(result.document.app.description).toBe('Reviewed and improved workflow.')
    expect(result.validation.valid).toBe(true)
  })
})
