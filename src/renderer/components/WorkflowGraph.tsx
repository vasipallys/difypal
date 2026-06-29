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
  useNodesState,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, useMemo, type CSSProperties } from 'react'
import { updateNodeInDsl } from '@/core/dsl/node-editor'
import { toFlowGraph } from '@/core/graph/converter'
import { useWorkspace } from '@/renderer/stores/workspace'

interface WorkflowNodeData {
  label?: string
  nodeType?: string
  description?: string
  accent?: string
}

function WorkflowNode({ id, data, selected }: NodeProps) {
  const node = data as WorkflowNodeData
  const nodeStyle = {
    '--workflow-node-accent': node.accent ?? '#6f8099',
  } as CSSProperties

  return (
    <div data-testid={`workflow-node-${id}`} className={`workflow-node${selected ? ' selected' : ''}`} style={nodeStyle}>
      <Handle type="target" position={Position.Left} />
      <div className="workflow-node-kind">{node.nodeType ?? 'node'}</div>
      <div className="workflow-node-title">{node.label ?? node.nodeType ?? 'Untitled node'}</div>
      {node.description && <div className="workflow-node-description">{node.description}</div>}
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

export function WorkflowGraph() {
  const { content, parsed, selectedNodeId, set } = useWorkspace()
  const nodeTypes = useMemo<NodeTypes>(() => ({ workflow: WorkflowNode }), [])
  const graph = useMemo(() => toFlowGraph(parsed), [parsed])
  const graphNodes = useMemo(
    () => graph.nodes.map(node => ({ ...node, selected: node.id === selectedNodeId })),
    [graph.nodes, selectedNodeId],
  )
  const [nodes, setNodes, onNodesChange] = useNodesState(graphNodes)

  useEffect(() => setNodes(graphNodes), [graphNodes, setNodes])

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
        nodes={nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        colorMode="dark"
        fitView
        fitViewOptions={{ padding: 0.25 }}
        nodesDraggable
        nodesConnectable={false}
        onNodesChange={onNodesChange}
        onNodeClick={(_event, node) => set({ selectedNodeId: node.id })}
        onNodeDragStop={(_event, node) => {
          try {
            set({
              content: updateNodeInDsl(content, node.id, { position: node.position }),
              notice: `Updated the position of ${String(node.data.label ?? node.id)} in the DSL.`,
            })
          }
          catch (error) {
            set({ notice: error instanceof Error ? error.message : String(error) })
          }
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Controls />
        <MiniMap
          nodeColor={node => String(node.data?.accent ?? '#728399')}
          nodeStrokeColor="#d5e2ef"
          nodeStrokeWidth={2}
          nodeBorderRadius={4}
          bgColor="#0a1119"
          maskColor="rgba(6, 12, 19, .34)"
          maskStrokeColor="#73d5ac"
          maskStrokeWidth={3}
          pannable
          zoomable
          ariaLabel="Workflow overview and current viewport"
          className="workflow-minimap"
        />
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#26364a" />
      </ReactFlow>
    </div>
  )
}
