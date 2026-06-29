import { lazy, Suspense, useEffect } from 'react'
import { parseDsl } from '@/core/dsl/parser'
import { isLoopbackAIProfile } from '@/core/ai/presets'
import { desktop } from '@/renderer/lib/desktop-api'
import { useWorkspace } from '@/renderer/stores/workspace'
import { Sidebar } from '@/renderer/components/Sidebar'
import { WorkspaceHeader } from '@/renderer/components/WorkspaceHeader'
import { Inspector } from '@/renderer/components/Inspector'
import { ApprovalPrompt } from '@/renderer/components/ApprovalPrompt'
import { RequirementPage } from '@/renderer/pages/RequirementPage'
import { ValidationPage } from '@/renderer/pages/ValidationPage'
import { DebuggerPage } from '@/renderer/pages/DebuggerPage'
import { DocumentPage } from '@/renderer/pages/DocumentPage'
import { ReviewPage } from '@/renderer/pages/ReviewPage'
import { AISettingsPage, DifySettingsPage } from '@/renderer/pages/SettingsPages'
import { CompatibilityPage } from '@/renderer/pages/CompatibilityPage'
import type { StudioProject } from '@/shared/types/desktop'

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
    const [projects, aiProfiles, difyProfiles, approvals, apiRuntime] = await Promise.all([
      desktop.projects.list(),
      desktop.settings.listAI(),
      desktop.settings.listDify(),
      desktop.approvals.list(),
      desktop.runtime.apiStatus(),
    ])
    set({ projects, aiProfiles, difyProfiles, approvals, apiRuntime })
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
      approvalPromptId: undefined,
      debuggerLaunch: undefined,
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
      debuggerLaunch: undefined,
      activeTab: 'editor',
      notice: `Opened ${loaded.name}.`,
    })
  }

  const startApiRuntime = async (
    target: Pick<StudioProject, 'id' | 'name' | 'dsl'>,
    loaded?: StudioProject,
  ): Promise<boolean> => {
    const current = useWorkspace.getState()
    const parsed = parseDsl(target.dsl).document
    const requiresModel = parsed?.workflow?.graph.nodes.some(node =>
      ['llm', 'question-classifier', 'parameter-extractor'].includes(node.data.type),
    )
    const profile = requiresModel ? current.aiProfiles[0] : undefined
    if (requiresModel && !profile) {
      set({ activeTab: 'ai-settings', notice: 'Configure an AI profile before starting this API runtime.' })
      return false
    }
    const title = `Start local API runtime: ${target.name} (${profile?.name ?? 'deterministic'})`
    if (profile && !isLoopbackAIProfile(profile)) {
      const approved = current.approvals.find(item =>
        item.action === 'external-ai' && item.title === title && item.status === 'approved',
      )
      if (!approved) {
        const pending = current.approvals.find(item =>
          item.action === 'external-ai' && item.title === title && item.status === 'pending',
        )
        const request = pending ?? await desktop.approvals.create({
          projectId: target.id,
          action: 'external-ai',
          title,
          summary: `Expose ${target.name} on 127.0.0.1. API callers may send model prompts through ${profile.name}.`,
          risk: 'high',
        })
        set({
          approvals: pending ? current.approvals : [request, ...current.approvals],
          approvalPromptId: request.id,
          notice: 'Approve the local API runtime, then start the API tester again.',
        })
        return false
      }
    }
    try {
      set({ busy: true })
      const status = await desktop.runtime.startApi(target.dsl, target.id, target.name, profile?.id)
      set({
        ...(loaded
          ? {
              project: loaded,
              content: loaded.dsl,
              requirement: loaded.requirement,
              documentation: loaded.documentation,
              generatedTests: loaded.generatedTests,
            }
          : {}),
        activeTab: 'debugger',
        apiRuntime: status,
        busy: false,
        notice: `Local API runtime started at ${status.baseUrl}.`,
      })
      return true
    }
    catch (error) {
      set({
        busy: false,
        notice: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }

  const startCurrentApiRuntime = async (): Promise<boolean> => {
    const current = useWorkspace.getState()
    if (!current.content.trim()) {
      set({ notice: 'Add or open a DSL before starting the local API runtime.' })
      return false
    }
    return startApiRuntime({
      id: current.project?.id ?? 'unsaved-workspace',
      name: current.project?.name ?? current.parsed?.app.name ?? 'Unsaved workflow',
      dsl: current.content,
    })
  }

  const runProject = async (id: string, mode: 'standalone' | 'api') => {
    const loaded = await desktop.projects.get(id)
    if (!loaded)
      return set({ notice: 'Project not found.' })
    if (mode === 'api') {
      await startApiRuntime(loaded, loaded)
      return
    }
    set({
      project: loaded,
      content: loaded.dsl,
      requirement: loaded.requirement,
      documentation: loaded.documentation,
      generatedTests: loaded.generatedTests,
      simulation: undefined,
      activeTab: 'debugger',
      debuggerLaunch: { id: Date.now(), mode: 'standalone' },
      notice: `Preparing ${loaded.name} for Graphon execution.`,
    })
  }

  const stopRuntime = async () => {
    try {
      const result = await desktop.runtime.stop()
      const apiStatus = await desktop.runtime.stopApi()
      set({
        busy: false,
        apiRuntime: apiStatus,
        notice: result.stopped
          ? `Stopped ${result.standaloneRuns} Graphon run(s), ${result.difyRequests} Dify request(s), and ${result.remoteDifyTasks} remote Dify task(s).`
          : 'There is no active runtime to stop.',
      })
    }
    catch (error) {
      set({ busy: false, notice: error instanceof Error ? error.message : String(error) })
    }
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
      debuggerLaunch: undefined,
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
    const name = project?.name || state.parsed?.app?.name || 'Untitled workflow'
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

  const renameProject = async (id: string, name: string) => {
    const existing = await desktop.projects.get(id)
    if (!existing)
      throw new Error('Project not found.')
    const saved = await desktop.projects.save({ ...existing, name })
    const current = useWorkspace.getState()
    set({
      project: current.project?.id === id ? saved : current.project,
      projects: [saved, ...current.projects.filter(item => item.id !== id)],
      notice: `Project renamed to ${saved.name}.`,
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
      const pending = state.approvals.find(item =>
        item.projectId === project?.id
        && item.action === 'export-dsl'
        && item.status === 'pending',
      )
      const request = pending ?? await desktop.approvals.create({
        projectId: project?.id,
        action: 'export-dsl',
        title: 'Export final Dify DSL',
        summary: `Export ${state.parsed?.app.name ?? 'the current workflow'} as a local YAML file after validation.`,
        risk: 'low',
      })
      set({
        approvals: pending ? state.approvals : [request, ...state.approvals],
        approvalPromptId: request.id,
        notice: 'Approve the final export, then click Export DSL again.',
      })
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
      case 'debugger': return <DebuggerPage onStartApi={startCurrentApiRuntime} />
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
      <Sidebar
        onNew={newProject}
        onUpload={upload}
        onOpen={openProject}
        onRename={renameProject}
        onRun={runProject}
        onStop={stopRuntime}
      />
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
      <ApprovalPrompt />
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  )
}
