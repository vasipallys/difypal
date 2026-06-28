import { describe, expect, it } from 'vitest'
import { buildContentSecurityPolicy } from '@/core/security/csp'

describe('Electron content security policy', () => {
  it('allows the Vite React preamble and HMR only in development', () => {
    const policy = buildContentSecurityPolicy('http://127.0.0.1:5173')
    expect(policy).toContain("script-src 'self' 'unsafe-eval' 'unsafe-inline' http://127.0.0.1:5173")
    expect(policy).toContain('ws://127.0.0.1:5173')
  })

  it('keeps production script execution strict', () => {
    const policy = buildContentSecurityPolicy()
    expect(policy).toContain("script-src 'self'")
    expect(policy).not.toContain("'unsafe-eval'")
    expect(policy).not.toContain("'unsafe-inline' http")
  })

  it('rejects non-HTTP development renderer URLs', () => {
    expect(() => buildContentSecurityPolicy('file:///tmp/index.html')).toThrow(/Unsupported/)
  })
})
