import { AlertTriangle, Box, CheckCircle2, Variable } from 'lucide-react'
import { useWorkspace } from '@/renderer/stores/workspace'

export function Inspector() {
  const { parsed, selectedNodeId, validation } = useWorkspace()
  const node = parsed?.workflow?.graph.nodes.find(item => item.id === selectedNodeId)
  const issues = validation?.issues.filter(issue => issue.nodeId === selectedNodeId) ?? []
  if (!node) {
    return (
      <aside className="inspector">
        <span className="sidebar-label">Inspector</span>
        <div className="inspector-empty">
          <Box size={24} />
          <p>Select a graph node to inspect its YAML path, inputs, outputs, and validation state.</p>
        </div>
      </aside>
    )
  }
  return (
    <aside className="inspector">
      <span className="sidebar-label">Selected node</span>
      <h2>{node.data.title ?? node.id}</h2>
      <span className="node-kind">{node.data.type}</span>
      <div className="inspector-block">
        <label>YAML path</label>
        <code>workflow.graph.nodes[id={node.id}]</code>
      </div>
      <div className="inspector-block">
        <label><Variable size={13} /> Configuration</label>
        <dl>
          {Object.entries(node.data).filter(([key]) => !['selected', 'title', 'type'].includes(key)).slice(0, 9).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{typeof value === 'object' ? JSON.stringify(value).slice(0, 90) : String(value)}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="inspector-block">
        <label>Validation</label>
        {!issues.length
          ? <p className="ok-copy"><CheckCircle2 size={14} /> No node-specific issues</p>
          : issues.map(issue => <p className="issue-copy" key={issue.id}><AlertTriangle size={14} /> {issue.message}</p>)}
      </div>
    </aside>
  )
}
