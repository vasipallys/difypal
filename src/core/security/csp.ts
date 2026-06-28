const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https: http:",
].join('; ')

export function buildContentSecurityPolicy(developmentUrl?: string): string {
  if (!developmentUrl)
    return PRODUCTION_CSP

  const parsed = new URL(developmentUrl)
  if (!['http:', 'https:'].includes(parsed.protocol))
    throw new Error(`Unsupported development renderer protocol: ${parsed.protocol}`)
  const origin = parsed.origin
  const websocketOrigin = `${parsed.protocol === 'https:' ? 'wss:' : 'ws:'}//${parsed.host}`
  return [
    `default-src 'self' ${origin}`,
    `script-src 'self' 'unsafe-eval' 'unsafe-inline' ${origin}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${origin} ${websocketOrigin} https: http:`,
  ].join('; ')
}
