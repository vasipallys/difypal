import {
  Bot,
  Braces,
  FileCode2,
  FileText,
  FolderKanban,
  History,
  Network,
  Plus,
  Settings2,
  ShieldCheck,
  TestTube2,
  Upload,
} from 'lucide-react'
import type { WorkspaceTab } from '@/renderer/stores/workspace'
import { useWorkspace } from '@/renderer/stores/workspace'

interface Props {
  onNew: () => void
  onUpload: () => void
  onOpen: (id: string) => void
}

export function Sidebar({ onNew, onUpload, onOpen }: Props) {
  const { projects, project, activeTab, set } = useWorkspace()
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
        <button className="sidebar-link" onClick={onNew}><FileCode2 size={16} /> Blank DSL</button>
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
          <button
            key={item.id}
            className={project?.id === item.id ? 'project-link active' : 'project-link'}
            onClick={() => onOpen(item.id)}
          >
            <span>{item.name}</span>
            <small>{new Date(item.updatedAt).toLocaleDateString()}</small>
          </button>
        ))}
        {!projects.length && <p className="empty-mini">Your local projects will live here.</p>}
      </div>

      <div className="sidebar-bottom">
        {nav('ai-settings', 'AI settings', Settings2)}
        {nav('dify-settings', 'Dify instance', History)}
        {nav('compatibility', 'Compatibility', ShieldCheck)}
      </div>
    </aside>
  )
}
