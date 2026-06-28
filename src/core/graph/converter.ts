import type { Edge, Node } from '@xyflow/react'
import type { DifyDsl } from '@/shared/types/dsl'

const colors: Record<string, string> = {
  start: '#46d38a',
  end: '#f5a95f',
  answer: '#f5a95f',
  llm: '#9876ff',
  'knowledge-retrieval': '#4bb6e8',
  'if-else': '#e8ca4b',
  code: '#67a7ff',
  tool: '#ff7e67',
  'human-input': '#f06dae',
}

export function toFlowGraph(dsl?: DifyDsl): { nodes: Node[]; edges: Edge[] } {
  const graph = dsl?.workflow?.graph
  if (!graph)
    return { nodes: [], edges: [] }

  const nodes = graph.nodes.map((node, index) => ({
    id: node.id,
    position: node.position ?? { x: 120 + (index % 3) * 300, y: 100 + Math.floor(index / 3) * 180 },
    data: {
      label: node.data.title || node.data.type,
      nodeType: node.data.type,
      raw: node,
    },
    style: {
      width: 220,
      border: `1px solid ${colors[node.data.type] ?? '#6f8099'}`,
      borderLeft: `4px solid ${colors[node.data.type] ?? '#6f8099'}`,
      borderRadius: 10,
      background: '#17202c',
      color: '#eef4ff',
      padding: 12,
      fontSize: 13,
    },
  }))

  const edges = graph.edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    label: edge.sourceHandle && edge.sourceHandle !== 'source' ? edge.sourceHandle : undefined,
    animated: false,
    style: { stroke: '#728399' },
  }))

  return { nodes, edges }
}
