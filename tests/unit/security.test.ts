import { describe, expect, it } from 'vitest'
import { redactSecrets, redactText } from '@/core/security/redaction'

describe('secret redaction', () => {
  it('redacts credential-shaped object fields recursively', () => {
    const output = redactSecrets({
      api_key: 'secret-value',
      nested: { Authorization: 'Bearer abcdefghijklmnop', visible: 'ok' },
    })
    expect(output.api_key).toBe('[REDACTED]')
    expect(output.nested.Authorization).toBe('[REDACTED]')
    expect(output.nested.visible).toBe('ok')
  })

  it('redacts well-known key formats in text', () => {
    expect(redactText('key=sk-abcdefghijklmnop')).not.toContain('abcdefghijklmnop')
  })
})
