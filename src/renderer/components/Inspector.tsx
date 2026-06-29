import { AlertTriangle, Box, CheckCircle2, Variable } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { updateNodeInDsl } from '@/core/dsl/node-editor'
import { useWorkspace } from '@/renderer/stores/workspace'

export function Inspector() {
  const { content, parsed, selectedNodeId, validation, set } = useWorkspace()
  const node = parsed?.workflow?.graph.nodes.find(item => item.id === selectedNodeId)
  const issues = validation?.issues.filter(issue => issue.nodeId === selectedNodeId) ?? []
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [positionX, setPositionX] = useState('0')
  const [positionY, setPositionY] = useState('0')
  const [configuration, setConfiguration] = useState('{}')
  const [editError, setEditError] = useState('')

  useEffect(() => {
    if (!node)
      return
    const nodeConfiguration = Object.fromEntries(
      Object.entries(node.data).filter(([key]) => !['type', 'title', 'desc', 'selected'].includes(key)),
    )
    setTitle(String(node.data.title ?? node.data.type))
    setDescription(String(node.data.desc ?? ''))
    setPositionX(String(node.position?.x ?? 0))
    setPositionY(String(node.position?.y ?? 0))
    setConfiguration(JSON.stringify(nodeConfiguration, null, 2))
    setEditError('')
  }, [node])

  const applyChanges = (event: FormEvent) => {
    event.preventDefault()
    if (!node)
      return
    try {
      const parsedConfiguration = JSON.parse(configuration) as unknown
      if (!parsedConfiguration || typeof parsedConfiguration !== 'object' || Array.isArray(parsedConfiguration))
        throw new Error('Configuration must be a JSON object.')
      const nextContent = updateNodeInDsl(content, node.id, {
        title: title.trim() || node.data.type,
        description,
        configuration: parsedConfiguration as Record<string, unknown>,
        position: {
          x: Number(positionX),
          y: Number(positionY),
        },
      })
      setEditError('')
      set({
        content: nextContent,
        notice: `Updated ${title.trim() || node.id} in the DSL.`,
      })
    }
    catch (error) {
      setEditError(error instanceof Error ? error.message : String(error))
    }
  }

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
      <form className="inspector-form" onSubmit={applyChanges}>
        <div className="inspector-block">
          <label><Variable size={13} /> Editable node fields</label>
          <label className="inspector-field">
            <span>Title</span>
            <input data-testid="node-title-input" value={title} onChange={event => setTitle(event.target.value)} />
          </label>
          <label className="inspector-field">
            <span>Description</span>
            <textarea data-testid="node-description-input" rows={3} value={description} onChange={event => setDescription(event.target.value)} />
          </label>
          <div className="inspector-position">
            <label className="inspector-field">
              <span>Position X</span>
              <input data-testid="node-position-x" type="number" value={positionX} onChange={event => setPositionX(event.target.value)} />
            </label>
            <label className="inspector-field">
              <span>Position Y</span>
              <input data-testid="node-position-y" type="number" value={positionY} onChange={event => setPositionY(event.target.value)} />
            </label>
          </div>
          <label className="inspector-field">
            <span>Configuration (JSON)</span>
            <textarea
              data-testid="node-configuration-input"
              className="inspector-code-input"
              rows={12}
              spellCheck={false}
              value={configuration}
              onChange={event => setConfiguration(event.target.value)}
            />
          </label>
          <p className="inspector-help">Edits are written to this node’s YAML data. Node ID and type remain protected to preserve graph connections.</p>
          {editError && <p className="inspector-edit-error" role="alert">{editError}</p>}
          <button data-testid="apply-node-changes" className="button accent inspector-apply" type="submit">Apply to DSL</button>
        </div>
      </form>
      <div className="inspector-block">
        <label>Validation</label>
        {!issues.length
          ? <p className="ok-copy"><CheckCircle2 size={14} /> No node-specific issues</p>
          : issues.map(issue => <p className="issue-copy" key={issue.id}><AlertTriangle size={14} /> {issue.message}</p>)}
      </div>
    </aside>
  )
}
