import { isMap, parseDocument, stringify } from 'yaml'
import type { DifyDsl, ParseResult, ValidationIssue } from '@/shared/types/dsl'

function yamlIssue(message: string, code: string, path?: string): ValidationIssue {
  return {
    id: `yaml:${code}:${path ?? message}`,
    category: 'yaml',
    severity: 'error',
    code,
    message,
    path,
  }
}

export function parseDsl(content: string): ParseResult {
  if (!content.trim())
    return { errors: [yamlIssue('DSL content is empty.', 'empty')] }

  const document = parseDocument(content, {
    prettyErrors: true,
    strict: true,
    uniqueKeys: true,
  })

  const errors = document.errors.map((error, index) =>
    yamlIssue(error.message, error.code || `parse-${index}`),
  )

  if (errors.length)
    return { errors }

  if (!isMap(document.contents))
    return { errors: [yamlIssue('DSL content must be a YAML mapping.', 'expected-mapping')] }

  const value = document.toJS({ maxAliasCount: 50 }) as unknown
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return { errors: [yamlIssue('DSL content must be a YAML mapping.', 'expected-mapping')] }

  return { document: value as DifyDsl, errors: [] }
}

export function formatDsl(content: string): string {
  const result = parseDsl(content)
  if (!result.document)
    throw new Error(result.errors[0]?.message ?? 'Invalid YAML')
  return stringify(result.document, { indent: 2, lineWidth: 0 })
}

export function serializeDsl(dsl: DifyDsl): string {
  return stringify(dsl, { indent: 2, lineWidth: 0 })
}
