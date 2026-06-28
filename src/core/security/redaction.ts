const SECRET_KEY = /(^|[_-])(api[_-]?key|secret|token|password|authorization|credential)([_-]|$)/i
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi
const COMMON_KEYS = /\b(sk-[A-Za-z0-9_-]{12,}|AIza[A-Za-z0-9_-]{20,}|gsk_[A-Za-z0-9_-]{12,}|xai-[A-Za-z0-9_-]{12,})\b/g

export function redactText(value: string): string {
  return value
    .replace(BEARER, 'Bearer [REDACTED]')
    .replace(COMMON_KEYS, '[REDACTED]')
}

export function redactSecrets<T>(value: T): T {
  const seen = new WeakSet<object>()

  function walk(item: unknown, key?: string): unknown {
    if (key && SECRET_KEY.test(key))
      return '[REDACTED]'
    if (typeof item === 'string')
      return redactText(item)
    if (!item || typeof item !== 'object')
      return item
    if (seen.has(item))
      return '[CIRCULAR]'
    seen.add(item)
    if (Array.isArray(item))
      return item.map(entry => walk(entry))
    return Object.fromEntries(
      Object.entries(item as Record<string, unknown>).map(([entryKey, entry]) => [
        entryKey,
        walk(entry, entryKey),
      ]),
    )
  }

  return walk(value) as T
}

export function looksLikeSecret(value: string): boolean {
  COMMON_KEYS.lastIndex = 0
  BEARER.lastIndex = 0
  return COMMON_KEYS.test(value) || BEARER.test(value)
}
