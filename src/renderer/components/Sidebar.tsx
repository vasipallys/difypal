import {
  Bot,
  Braces,
  FileCode2,
  FileText,
  FolderKanban,
  History,
  MoreHorizontal,
  Network,
  Palette,
  Pencil,
  Play,
  Plus,
  Save,
  Settings2,
  ShieldCheck,
  Square,
  TestTube2,
  Upload,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { workspaceThemes, type WorkspaceTheme } from '@/renderer/lib/themes'
import type { WorkspaceTab } from '@/renderer/stores/workspace'
import { useWorkspace } from '@/renderer/stores/workspace'

interface Props {
  onNew: () => void
  onBlank: () => void
  onUpload: () => void
  onOpen: (id: string) => void
  onRename: (id: string, name: string) => Promise<void>
  onRun: (id: string, mode: 'standalone' | 'api') => Promise<void>
  onStop: () => Promise<void>
}

export function Sidebar({ onNew, onBlank, onUpload, onOpen, onRename, onRun, onStop }: Props) {
  const { projects, project, activeTab, busy, apiRuntime, theme, set } = useWorkspace()
  const [menuProjectId, setMenuProjectId] = useState<string>()
  const [editingProjectId, setEditingProjectId] = useState<string>()
  const [draftName, setDraftName] = useState('')
  const [renaming, setRenaming] = useState(false)

  const beginRename = (id: string, name: string) => {
    setMenuProjectId(undefined)
    setEditingProjectId(id)
    setDraftName(name)
  }
  const cancelRename = () => {
    setEditingProjectId(undefined)
    setDraftName('')
  }
  const submitRename = async (id: string) => {
    const name = draftName.trim()
    if (!name)
      return
    setRenaming(true)
    try {
      await onRename(id, name)
      cancelRename()
    }
    catch (error) {
      set({ notice: error instanceof Error ? error.message : String(error) })
    }
    finally {
      setRenaming(false)
    }
  }
  const nav = (tab: WorkspaceTab, label: string, Icon: typeof Plus) => (
    <button className={activeTab === tab ? 'sidebar-link active' : 'sidebar-link'} onClick={() => set({ activeTab: tab })}>
      <Icon size={16} />
      <span>{label}</span>
    </button>
  )

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><Braces size={19} /></div>
        <div>
          <strong>Dify DSL Studio</strong>
          <span>Local workflow lab</span>
        </div>
      </div>

      <div className="sidebar-section">
        <span className="sidebar-label">Create</span>
        <button className="sidebar-link primary" onClick={onNew}><Plus size={16} /> New from requirement</button>
        <button className="sidebar-link" onClick={onUpload}><Upload size={16} /> Upload DSL</button>
        <button className="sidebar-link" onClick={onBlank}><FileCode2 size={16} /> Blank DSL</button>
      </div>

      <div className="sidebar-section">
        <span className="sidebar-label">Workspace</span>
        {nav('requirement', 'Requirement', Bot)}
        {nav('editor', 'DSL editor', FileCode2)}
        {nav('visual', 'Visual workflow', Network)}
        {nav('documentation', 'Documentation', FileText)}
        {nav('tests', 'Test suites', TestTube2)}
        {nav('review', 'AI review & approvals', ShieldCheck)}
      </div>

      <div className="sidebar-section projects-list">
        <span className="sidebar-label"><FolderKanban size={13} /> Recent projects</span>
        {projects.slice(0, 6).map(item => (
          <div className={project?.id === item.id ? 'project-row active' : 'project-row'} key={item.id}>
            {editingProjectId === item.id
              ? (
                  <form className="project-rename" onSubmit={(event) => { event.preventDefault(); void submitRename(item.id) }}>
                    <input
                      data-testid="rename-project-input"
                      aria-label="New project name"
                      autoFocus
                      maxLength={120}
                      value={draftName}
                      onChange={event => setDraftName(event.target.value)}
                    />
                    <button type="submit" aria-label="Save project name" disabled={renaming || !draftName.trim()}><Save size={13} /></button>
                    <button type="button" aria-label="Cancel project rename" onClick={cancelRename}><X size={13} /></button>
                  </form>
                )
              : (
                  <>
                    <button
                      className="project-link"
                      onClick={() => { setMenuProjectId(undefined); onOpen(item.id) }}
                    >
                      <span>{item.name}</span>
                      <small>{new Date(item.updatedAt).toLocaleDateString()}</small>
                    </button>
                    <button
                      className="project-menu-trigger"
                      aria-label={`Project actions for ${item.name}`}
                      aria-expanded={menuProjectId === item.id}
                      onClick={() => setMenuProjectId(current => current === item.id ? undefined : item.id)}
                    >
                      <MoreHorizontal size={15} />
                    </button>
                    {menuProjectId === item.id && (
                      <div className="project-menu" role="menu">
                        <button
                          role="menuitem"
                          onClick={() => { setMenuProjectId(undefined); void onRun(item.id, 'standalone') }}
                        >
                          <Play size={13} /> Run with Graphon
                        </button>
                        <button
                          role="menuitem"
                          onClick={() => { setMenuProjectId(undefined); void onRun(item.id, 'api') }}
                        >
                          <Network size={13} /> Start local API runtime
                        </button>
                        <button
                          role="menuitem"
                          disabled={!busy && !apiRuntime?.running}
                          onClick={() => { setMenuProjectId(undefined); void onStop() }}
                        >
                          <Square size={12} /> Stop active run
                        </button>
                        <span className="project-menu-separator" />
                        <button role="menuitem" onClick={() => beginRename(item.id, item.name)}><Pencil size={13} /> Rename</button>
                      </div>
                    )}
                  </>
                )}
          </div>
        ))}
        {!projects.length && <p className="empty-mini">Your local projects will live here.</p>}
      </div>

      <div className="sidebar-bottom">
        <div className="theme-picker">
          <label htmlFor="workspace-theme"><Palette size={13} /> Theme</label>
          <select
            id="workspace-theme"
            data-testid="workspace-theme"
            value={theme}
            onChange={event => set({ theme: event.target.value as WorkspaceTheme })}
          >
            {workspaceThemes.map(option => (
              <option value={option.id} key={option.id}>{option.label}</option>
            ))}
          </select>
        </div>
        {nav('ai-settings', 'AI settings', Settings2)}
        {nav('dify-settings', 'Dify instance', History)}
        {nav('compatibility', 'Compatibility', ShieldCheck)}
      </div>
    </aside>
  )
}
