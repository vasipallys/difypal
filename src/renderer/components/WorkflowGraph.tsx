import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useMemo, type CSSProperties } from 'react'
import { toFlowGraph } from '@/core/graph/converter'
import { useWorkspace } from '@/renderer/stores/workspace'

interface WorkflowNodeData {
  label?: string
  nodeType?: string
  description?: string
  accent?: string
}

function WorkflowNode({ data, selected }: NodeProps) {
  const node = data as WorkflowNodeData
  const nodeStyle = {
    '--workflow-node-accent': node.accent ?? '#6f8099',
  } as CSSProperties

  return (
    <div className={`workflow-node${selected ? ' selected' : ''}`} style={nodeStyle}>
      <Handle type="target" position={Position.Left} />
      <div className="workflow-node-kind">{node.nodeType ?? 'node'}</div>
      <div className="workflow-node-title">{node.label ?? node.nodeType ?? 'Untitled node'}</div>
      {node.description && <div className="workflow-node-description">{node.description}</div>}
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

export function WorkflowGraph() {
  const { parsed, set } = useWorkspace()
  const nodeTypes = useMemo<NodeTypes>(() => ({ workflow: WorkflowNode }), [])
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
        nodeTypes={nodeTypes}
        colorMode="dark"
        fitView
        fitViewOptions={{ padding: 0.25 }}
        nodesDraggable
        nodesConnectable={false}
        onNodeClick={(_event, node) => set({ selectedNodeId: node.id })}
        proOptions={{ hideAttribution: true }}
      >
        <Controls />
        <MiniMap
          nodeColor={node => String(node.data?.accent ?? '#728399')}
          nodeStrokeColor="#0d151f"
          nodeStrokeWidth={3}
          maskColor="rgba(7, 12, 18, .72)"
        />
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#26364a" />
      </ReactFlow>
    </div>
  )
}
