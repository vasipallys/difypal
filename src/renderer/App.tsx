import { lazy, Suspense, useEffect } from 'react'
import { parseDsl } from '@/core/dsl/parser'
import { desktop } from '@/renderer/lib/desktop-api'
import { useWorkspace } from '@/renderer/stores/workspace'
import { Sidebar } from '@/renderer/components/Sidebar'
import { WorkspaceHeader } from '@/renderer/components/WorkspaceHeader'
import { Inspector } from '@/renderer/components/Inspector'
import { RequirementPage } from '@/renderer/pages/RequirementPage'
import { ValidationPage } from '@/renderer/pages/ValidationPage'
import { DebuggerPage } from '@/renderer/pages/DebuggerPage'
import { DocumentPage } from '@/renderer/pages/DocumentPage'
import { ReviewPage } from '@/renderer/pages/ReviewPage'
import { AISettingsPage, DifySettingsPage } from '@/renderer/pages/SettingsPages'
import { CompatibilityPage } from '@/renderer/pages/CompatibilityPage'

const EditorPane = lazy(async () => {
  const module = await import('@/renderer/components/EditorPane')
  return { default: module.EditorPane }
})
const WorkflowGraph = lazy(async () => {
  const module = await import('@/renderer/components/WorkflowGraph')
  return { default: module.WorkflowGraph }
})

export default function App() {
  const state = useWorkspace()
  const { activeTab, content, project, notice, set } = state

  const refresh = async () => {
    const [projects, aiProfiles, difyProfiles, approvals] = await Promise.all([
      desktop.projects.list(),
      desktop.settings.listAI(),
      desktop.settings.listDify(),
      desktop.approvals.list(),
    ])
    set({ projects, aiProfiles, difyProfiles, approvals })
  }

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!content.trim()) {
        set({ parsed: undefined, validation: undefined })
        return
      }
      const [validation, parsed] = await Promise.all([
        desktop.runtime.validate(content),
        Promise.resolve(parseDsl(content)),
      ])
      set({ validation, parsed: parsed.document })
    }, 300)
    return () => clearTimeout(timer)
  }, [content])

  useEffect(() => {
    if (!notice)
      return
    const timer = setTimeout(() => set({ notice: undefined }), 5000)
    return () => clearTimeout(timer)
  }, [notice])

  const newProject = () => {
    set({
      project: undefined,
      content: '',
      requirement: '',
      parsed: undefined,
      validation: undefined,
      simulation: undefined,
      documentation: '',
      generatedTests: '',
      proposedDsl: undefined,
      fixApprovalId: undefined,
      activeTab: 'requirement',
      selectedNodeId: undefined,
      notice: 'New local workspace ready.',
    })
  }

  const openProject = async (id: string) => {
    const loaded = await desktop.projects.get(id)
    if (!loaded)
      return
    set({
      project: loaded,
      content: loaded.dsl,
      requirement: loaded.requirement,
      documentation: loaded.documentation,
      generatedTests: loaded.generatedTests,
      activeTab: 'editor',
      notice: `Opened ${loaded.name}.`,
    })
  }

  const applyImported = (content: string, name: string) => {
    const parsed = parseDsl(content)
    set({
      project: undefined,
      content,
      parsed: parsed.document,
      requirement: '',
      documentation: '',
      generatedTests: '',
      activeTab: 'editor',
      notice: `Imported ${name}.`,
    })
  }

  const upload = async () => {
    const imported = await desktop.files.importDsl()
    if (imported) {
      applyImported(imported.content, imported.path.split(/[\\/]/).pop() ?? 'DSL')
      return
    }
    if (desktop.platform === 'browser') {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.yml,.yaml,application/yaml,text/yaml'
      input.onchange = async () => {
        const file = input.files?.[0]
        if (file)
          applyImported(await file.text(), file.name)
      }
      input.click()
    }
  }

  const saveProject = async () => {
    const name = state.parsed?.app?.name || project?.name || 'Untitled workflow'
    const saved = await desktop.projects.save({
      ...project,
      name,
      description: state.parsed?.app?.description ?? project?.description ?? '',
      appMode: state.parsed?.app?.mode ?? project?.appMode ?? 'workflow',
      requirement: state.requirement,
      dsl: content,
      documentation: state.documentation,
      generatedTests: state.generatedTests,
    })
    set({
      project: saved,
      projects: [saved, ...state.projects.filter(item => item.id !== saved.id)],
      notice: 'Project saved locally.',
    })
  }

  const exportDsl = async () => {
    if (!content.trim())
      return set({ notice: 'There is no DSL to export.' })
    if (!state.validation?.valid)
      return set({ activeTab: 'validation', notice: 'Resolve blocking validation errors before export.' })
    const approved = state.approvals.find(item =>
      item.projectId === project?.id
      && item.action === 'export-dsl'
      && item.status === 'approved',
    )
    if (!approved) {
      const request = await desktop.approvals.create({
        projectId: project?.id,
        action: 'export-dsl',
        title: 'Export final Dify DSL',
        summary: `Export ${state.parsed?.app.name ?? 'the current workflow'} as a local YAML file after validation.`,
        risk: 'low',
      })
      set({ approvals: [request, ...state.approvals], activeTab: 'review', notice: 'Approve the final export, then click Export DSL again.' })
      return
    }
    const path = await desktop.files.exportDsl(content, `${state.parsed?.app.name ?? 'dify-workflow'}.yml`)
    if (path) {
      const applied = await desktop.approvals.decide(approved.id, 'applied')
      set({ approvals: state.approvals.map(item => item.id === approved.id ? applied : item), notice: `Exported ${path}.` })
    }
  }

  const central = () => {
    switch (activeTab) {
      case 'requirement': return <RequirementPage />
      case 'editor': return <EditorPane />
      case 'visual': return <WorkflowGraph />
      case 'debugger': return <DebuggerPage />
      case 'validation': return <ValidationPage />
      case 'documentation': return <DocumentPage kind="documentation" />
      case 'tests': return <DocumentPage kind="tests" />
      case 'review': return <ReviewPage />
      case 'ai-settings': return <AISettingsPage />
      case 'dify-settings': return <DifySettingsPage />
      case 'compatibility': return <CompatibilityPage />
    }
  }

  const showInspector = ['editor', 'visual', 'validation'].includes(activeTab)
  const settingsOnly = ['ai-settings', 'dify-settings', 'compatibility'].includes(activeTab)

  return (
    <div className="app-shell">
      <Sidebar onNew={newProject} onUpload={upload} onOpen={openProject} />
      <main className="main-shell">
        {!settingsOnly && <WorkspaceHeader onSave={saveProject} onExport={exportDsl} />}
        <div className={showInspector ? 'workspace-body with-inspector' : 'workspace-body'}>
          <div className="workspace-content">
            <Suspense fallback={<div className="empty-state"><p>Loading workspace module…</p></div>}>
              {central()}
            </Suspense>
          </div>
          {showInspector && <Inspector />}
        </div>
      </main>
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  )
}
