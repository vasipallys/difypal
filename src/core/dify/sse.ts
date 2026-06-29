export function parseDifySseBlock(block: string): Record<string, unknown> | null {
  const payload = block.split(/\r?\n/)
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trimStart())
    .join('\n')
  if (!payload || payload === '[DONE]')
    return null
  const value = JSON.parse(payload) as unknown
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Dify returned a malformed workflow event.')
  return value as Record<string, unknown>
}
