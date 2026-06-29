import { describe, expect, it } from 'vitest'
import { createStarterDsl, starterTemplates } from '@/core/dsl/starter-templates'
import { validateDsl } from '@/core/validation/validator'

describe('starter DSL templates', () => {
  it('generates valid DSL for every blank creation option', () => {
    for (const template of starterTemplates) {
      const starter = createStarterDsl(template.id)
      const validation = validateDsl(starter.dsl)

      expect(starter.document.app.name).toBeTruthy()
      expect(starter.document.workflow?.graph.nodes.length).toBeGreaterThanOrEqual(2)
      expect(validation.issues.filter(issue => issue.severity === 'error')).toEqual([])
      expect(validation.valid, template.title).toBe(true)
    }
  })
})
