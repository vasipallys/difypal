import type { AppMode, DifyDsl, ValidationResult } from '@/shared/types/dsl'
import { parseDsl } from '@/core/dsl/parser'
import { generateDraftFromRequirement } from '@/core/dsl/generator'
import { validateDsl } from '@/core/validation/validator'
import { generateDocumentation } from '@/core/docs/generator'
import { generateTestPlan } from '@/core/tests-generator/generator'

export interface RequirementAnalysis {
  appType: Extract<AppMode, 'workflow' | 'advanced-chat'>
  goal: string
  inputs: string[]
  outputs: string[]
  requiredNodes: string[]
  integrations: string[]
  approvals: string[]
  errorPaths: string[]
  testScenarios: string[]
}

export interface PipelineResult {
  analysis: RequirementAnalysis
  planSummary: string[]
  dsl: string
  document: DifyDsl
  validation: ValidationResult
  documentation: string
  tests: string
  confidence: number
  risks: string[]
  requiredApprovals: string[]
}

export function analyzeRequirement(
  requirement: string,
  appType: Extract<AppMode, 'workflow' | 'advanced-chat'>,
): RequirementAnalysis {
  const lower = requirement.toLowerCase()
  const integrations = ['api', 'http', 'tool', 'webhook'].some(term => lower.includes(term)) ? ['External API/tool'] : []
  if (['knowledge', 'rag', 'document', 'retrieval'].some(term => lower.includes(term)))
    integrations.push('Knowledge retrieval')
  const approvals = ['approve', 'human', 'review'].some(term => lower.includes(term)) ? ['Human approval'] : []
  return {
    appType,
    goal: requirement.trim(),
    inputs: ['input'],
    outputs: ['result'],
    requiredNodes: ['start', 'llm', appType === 'advanced-chat' ? 'answer' : 'end'],
    integrations,
    approvals,
    errorPaths: integrations.length ? ['External dependency unavailable', 'Timeout', 'Invalid response'] : ['Invalid input'],
    testScenarios: ['Golden path', 'Empty input', 'Long input', 'Provider failure'],
  }
}

export function runOfflinePipeline(
  requirement: string,
  appType: Extract<AppMode, 'workflow' | 'advanced-chat'>,
  provider?: string,
  model?: string,
): PipelineResult {
  const analysis = analyzeRequirement(requirement, appType)
  const dsl = generateDraftFromRequirement(requirement, appType, provider, model)
  const document = parseDsl(dsl).document!
  const validation = validateDsl(dsl)
  return {
    analysis,
    planSummary: [
      `Create a ${appType} with explicit user input.`,
      'Use one model node with a constrained prompt and uncertainty guardrail.',
      `Route the result to ${appType === 'advanced-chat' ? 'an answer' : 'a typed output'} node.`,
      'Validate, simulate with mocks, then require approval before export.',
    ],
    dsl,
    document,
    validation,
    documentation: generateDocumentation(document, validation),
    tests: generateTestPlan(document),
    confidence: validation.valid ? 0.88 : 0.62,
    risks: [
      'Model provider and model name must exist in the target Dify workspace.',
      'Generated draft should be imported and tested against the target Dify version.',
    ],
    requiredApprovals: ['External AI call (if used)', 'Final DSL export'],
  }
}
