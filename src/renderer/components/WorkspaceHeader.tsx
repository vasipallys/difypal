import { Check, CircleAlert, Download, Save, Sparkles } from 'lucide-react'
import type { WorkspaceTab } from '@/renderer/stores/workspace'
import { useWorkspace } from '@/renderer/stores/workspace'

const tabs: Array<[WorkspaceTab, string]> = [
  ['requirement', 'Requirement'],
  ['editor', 'DSL Editor'],
  ['visual', 'Visual Workflow'],
  ['debugger', 'Debugger'],
  ['validation', 'Validation'],
  ['documentation', 'Documentation'],
  ['tests', 'Test Cases'],
  ['review', 'AI Review'],
]

interface Props {
  onSave: () => void
  onExport: () => void
}

export function WorkspaceHeader({ onSave, onExport }: Props) {
  const { project, activeTab, validation, busy, set } = useWorkspace()
  const errors = validation?.issues.filter(item => item.severity === 'error').length ?? 0
  return (
    <>
      <header className="workspace-header">
        <div className="workspace-title">
          <span className="eyebrow">Local project</span>
          <h1>{project?.name ?? 'Untitled workflow'}</h1>
        </div>
        <div className="header-status">
          <span className={errors ? 'status-pill invalid' : 'status-pill valid'}>
            {errors ? <CircleAlert size={14} /> : <Check size={14} />}
            {validation ? (errors ? `${errors} errors` : 'Import-ready checks pass') : 'Not validated'}
          </span>
          <button className="button ghost" onClick={onSave} disabled={busy}><Save size={15} /> Save</button>
          <button className="button accent" onClick={onExport} disabled={busy}><Download size={15} /> Export DSL</button>
        </div>
      </header>
      <nav className="tabs" aria-label="Workspace tabs">
        {tabs.map(([id, label]) => (
          <button key={id} className={activeTab === id ? 'tab active' : 'tab'} onClick={() => set({ activeTab: id })}>
            {id === 'review' && <Sparkles size={13} />}
            {label}
          </button>
        ))}
      </nav>
    </>
  )
}
