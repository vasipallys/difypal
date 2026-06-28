import { parseDsl, serializeDsl } from './parser'
import type { DifyDsl } from '@/shared/types/dsl'

export interface FixProposal {
  changed: boolean
  content: string
  summary: string[]
}

export function proposeSafeFixes(content: string): FixProposal {
  const parsed = parseDsl(content)
  if (!parsed.document)
    throw new Error('YAML syntax must be valid before structural fixes can be proposed.')
  const dsl = structuredClone(parsed.document) as DifyDsl
  const summary: string[] = []
  if (!dsl.version) {
    dsl.version = '0.6.0'
    summary.push('Add explicit DSL version 0.6.0.')
  }
  if (dsl.kind !== 'app') {
    dsl.kind = 'app'
    summary.push('Normalize top-level kind to app.')
  }
  if (!dsl.dependencies) {
    dsl.dependencies = []
    summary.push('Add an explicit dependency list.')
  }
  if (dsl.workflow) {
    if (!dsl.workflow.environment_variables) {
      dsl.workflow.environment_variables = []
      summary.push('Add environment_variables list.')
    }
    if (!dsl.workflow.conversation_variables) {
      dsl.workflow.conversation_variables = []
      summary.push('Add conversation_variables list.')
    }
    if (!dsl.workflow.rag_pipeline_variables) {
      dsl.workflow.rag_pipeline_variables = []
      summary.push('Add rag_pipeline_variables list.')
    }
    const nodes = new Map(dsl.workflow.graph.nodes.map(node => [node.id, node]))
    dsl.workflow.graph.nodes.forEach((node, index) => {
      if (!node.position) {
        node.position = { x: 80 + (index % 3) * 310, y: 180 + Math.floor(index / 3) * 180 }
        summary.push(`Add canvas coordinates to node ${node.id}.`)
      }
    })
    for (const edge of dsl.workflow.graph.edges) {
      const sourceType = nodes.get(edge.source)?.data.type
      const targetType = nodes.get(edge.target)?.data.type
      edge.sourceHandle ??= 'source'
      edge.targetHandle ??= 'target'
      edge.type ??= 'custom'
      edge.data ??= {}
      if (sourceType)
        edge.data.sourceType = sourceType
      if (targetType)
        edge.data.targetType = targetType
    }
    if (dsl.workflow.graph.edges.length)
      summary.push('Normalize edge handles, canvas type, and endpoint type metadata.')
  }
  return {
    changed: summary.length > 0,
    content: serializeDsl(dsl),
    summary,
  }
}
