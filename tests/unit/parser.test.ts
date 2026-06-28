import { describe, expect, it } from 'vitest'
import { formatDsl, parseDsl } from '@/core/dsl/parser'

describe('DSL parser', () => {
  it('parses a mapping and preserves version as a string', () => {
    const result = parseDsl('version: 0.6.0\nkind: app\napp:\n  name: Example\n  mode: workflow\n')
    expect(result.errors).toEqual([])
    expect(result.document?.version).toBe('0.6.0')
  })

  it('rejects duplicate keys', () => {
    const result = parseDsl('kind: app\nkind: graph\n')
    expect(result.document).toBeUndefined()
    expect(result.errors[0]?.message).toMatch(/Map keys must be unique|unique/i)
  })

  it('rejects non-mapping YAML', () => {
    expect(parseDsl('- one\n- two\n').errors[0]?.code).toBe('expected-mapping')
  })

  it('formats valid YAML', () => {
    expect(formatDsl('kind: app\nversion: 0.6.0\napp: {name: X, mode: workflow}\n')).toContain('name: X')
  })
})
