import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useMemo } from 'react'
import { toFlowGraph } from '@/core/graph/converter'
import { useWorkspace } from '@/renderer/stores/workspace'

export function WorkflowGraph() {
  const { parsed, set } = useWorkspace()
  const graph = useMemo(() => toFlowGraph(parsed), [parsed])

  if (!graph.nodes.length) {
    return (
      <div className="empty-state">
        <div className="empty-orbit">◇</div>
        <h2>No executable graph yet</h2>
        <p>Generate a workflow or paste a valid workflow/chatflow DSL.</p>
      </div>
    )
  }

  return (
    <div className="flow-shell">
      <ReactFlow
        nodes={graph.nodes}
        edges={graph.edges}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        nodesDraggable
        nodesConnectable={false}
        onNodeClick={(_event, node) => set({ selectedNodeId: node.id })}
        proOptions={{ hideAttribution: true }}
      >
        <Controls />
        <MiniMap
          nodeColor={node => String(node.style?.borderLeft ?? '#728399').split(' ').at(-1) ?? '#728399'}
          maskColor="rgba(7, 12, 18, .72)"
        />
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#26364a" />
      </ReactFlow>
    </div>
  )
}
