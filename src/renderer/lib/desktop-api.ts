import type {
  AIProfile,
  ApprovalRequest,
  DesktopApi,
  DifyProfile,
  StudioProject,
} from '@/shared/types/desktop'
import { validateDsl } from '@/core/validation/validator'
import { simulateDsl } from '@/core/runner/simulator'

const PROJECTS = 'dify-studio:projects'
const APPROVALS = 'dify-studio:approvals'
const AI_PROFILES = 'dify-studio:ai-profiles'
const DIFY_PROFILES = 'dify-studio:dify-profiles'

function load<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '') as T
  }
  catch {
    return fallback
  }
}

function save<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value))
}

function browserApi(): DesktopApi {
  return {
    projects: {
      list: async () => load<StudioProject[]>(PROJECTS, []),
      get: async id => load<StudioProject[]>(PROJECTS, []).find(project => project.id === id) ?? null,
      save: async input => {
        const projects = load<StudioProject[]>(PROJECTS, [])
        const existing = input.id ? projects.find(project => project.id === input.id) : undefined
        const now = new Date().toISOString()
        const project: StudioProject = {
          id: existing?.id ?? crypto.randomUUID(),
          name: input.name,
          description: input.description ?? existing?.description ?? '',
          appMode: input.appMode ?? existing?.appMode ?? 'workflow',
          requirement: input.requirement ?? existing?.requirement ?? '',
          dsl: input.dsl ?? existing?.dsl ?? '',
          documentation: input.documentation ?? existing?.documentation ?? '',
          generatedTests: input.generatedTests ?? existing?.generatedTests ?? '',
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        }
        save(PROJECTS, [project, ...projects.filter(item => item.id !== project.id)])
        return project
      },
      remove: async id => save(PROJECTS, load<StudioProject[]>(PROJECTS, []).filter(project => project.id !== id)),
    },
    files: {
      importDsl: async () => null,
      exportDsl: async (content, suggestedName) => {
        const anchor = document.createElement('a')
        anchor.href = URL.createObjectURL(new Blob([content], { type: 'application/yaml' }))
        anchor.download = suggestedName.endsWith('.yml') ? suggestedName : `${suggestedName}.yml`
        anchor.click()
        URL.revokeObjectURL(anchor.href)
        return anchor.download
      },
      exportText: async (content, suggestedName, format) => {
        const anchor = document.createElement('a')
        anchor.href = URL.createObjectURL(new Blob([content], { type: format === 'md' ? 'text/markdown' : 'text/html' }))
        anchor.download = `${suggestedName}.${format}`
        anchor.click()
        URL.revokeObjectURL(anchor.href)
        return anchor.download
      },
    },
    settings: {
      listAI: async () => load<AIProfile[]>(AI_PROFILES, []),
      saveAI: async profile => {
        const profiles = load<AIProfile[]>(AI_PROFILES, [])
        save(AI_PROFILES, [profile, ...profiles.filter(item => item.id !== profile.id)])
        return profile
      },
      listDify: async () => load<DifyProfile[]>(DIFY_PROFILES, []),
      saveDify: async profile => {
        const profiles = load<DifyProfile[]>(DIFY_PROFILES, [])
        save(DIFY_PROFILES, [profile, ...profiles.filter(item => item.id !== profile.id)])
        return profile
      },
    },
    approvals: {
      list: async projectId => load<ApprovalRequest[]>(APPROVALS, []).filter(item => !projectId || item.projectId === projectId),
      create: async input => {
        const request: ApprovalRequest = {
          ...input,
          id: crypto.randomUUID(),
          status: 'pending',
          createdAt: new Date().toISOString(),
        }
        save(APPROVALS, [request, ...load<ApprovalRequest[]>(APPROVALS, [])])
        return request
      },
      decide: async (id, status) => {
        const approvals = load<ApprovalRequest[]>(APPROVALS, [])
        const updated = approvals.map(item => item.id === id ? { ...item, status, decidedAt: new Date().toISOString() } : item)
        save(APPROVALS, updated)
        return updated.find(item => item.id === id)!
      },
    },
    runtime: {
      validate: async content => validateDsl(content),
      simulate: async (content, inputs, mocks) => simulateDsl(content, inputs, mocks),
      standaloneStatus: async () => { throw new Error('Standalone Graphon runtime requires the Electron desktop app.') },
      runStandalone: async () => { throw new Error('Standalone Graphon runtime requires the Electron desktop app.') },
      stop: async () => ({ stopped: false, standaloneRuns: 0, difyRequests: 0, remoteDifyTasks: 0 }),
      startApi: async () => { throw new Error('Local API runtime requires the Electron desktop app.') },
      stopApi: async () => ({ running: false, activeRuns: 0 }),
      apiStatus: async () => ({ running: false, activeRuns: 0 }),
      generateAI: async () => { throw new Error('External AI generation requires the Electron desktop app.') },
      runDify: async () => { throw new Error('Real Dify execution requires the Electron desktop app.') },
      testDify: async () => ({ ok: false, message: 'Connection tests require the Electron desktop app.' }),
      testAI: async () => ({ ok: false, message: 'Connection tests require the Electron desktop app.' }),
    },
    platform: 'browser',
  }
}

export const desktop = window.studio ?? browserApi()
