import { parseDocument } from 'yaml'
import type { Position } from '@/shared/types/dsl'

export interface NodeDslUpdate {
  title?: string
  description?: string
  configuration?: Record<string, unknown>
  position?: Position
}

export function updateNodeInDsl(
  content: string,
  nodeId: string,
  update: NodeDslUpdate,
): string {
  const document = parseDocument(content, {
    prettyErrors: true,
    strict: true,
    uniqueKeys: true,
  })
  if (document.errors.length)
    throw new Error(document.errors[0]?.message ?? 'The DSL is not valid YAML.')

  const dsl = document.toJS({ maxAliasCount: 50 }) as {
    workflow?: {
      graph?: {
        nodes?: Array<{
          id?: string
          position?: Position
          positionAbsolute?: Position
          data?: Record<string, unknown>
        }>
      }
    }
  }
  const nodes = dsl.workflow?.graph?.nodes
  const nodeIndex = nodes?.findIndex(node => node.id === nodeId) ?? -1
  if (nodeIndex < 0)
    throw new Error(`Node "${nodeId}" was not found in the current DSL.`)

  const node = nodes![nodeIndex]!
  const nodePath = ['workflow', 'graph', 'nodes', nodeIndex]
  if (update.configuration) {
    const nextData: Record<string, unknown> = {
      ...update.configuration,
      type: node.data?.type,
      title: update.title ?? node.data?.title,
    }
    const description = update.description ?? node.data?.desc
    if (typeof description === 'string' && description.trim())
      nextData.desc = description
    document.setIn([...nodePath, 'data'], nextData)
  }
  else {
    if (update.title !== undefined)
      document.setIn([...nodePath, 'data', 'title'], update.title)
    if (update.description !== undefined) {
      if (update.description.trim())
        document.setIn([...nodePath, 'data', 'desc'], update.description)
      else
        document.deleteIn([...nodePath, 'data', 'desc'])
    }
  }

  if (update.position) {
    if (!Number.isFinite(update.position.x) || !Number.isFinite(update.position.y))
      throw new Error('Node position must use finite X and Y numbers.')
    document.setIn([...nodePath, 'position'], update.position)
    if (node.positionAbsolute)
      document.setIn([...nodePath, 'positionAbsolute'], update.position)
  }

  return document.toString({ indent: 2, lineWidth: 0 })
}
