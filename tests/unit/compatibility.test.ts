import { describe, expect, it } from 'vitest'
import { checkVersionCompatibility } from '@/core/dsl/compatibility'

describe('Dify version compatibility', () => {
  it.each([
    ['0.6.0', 'current'],
    ['0.5.9', 'warning'],
    ['0.6.1', 'confirmation-required'],
    ['1.0.0', 'confirmation-required'],
    ['not-semver', 'invalid'],
  ])('maps %s to %s', (version, status) => {
    expect(checkVersionCompatibility(version).status).toBe(status)
  })
})
