import type { DifyDsl, SimulationResult, ValidationResult } from './dsl'

export interface ProjectSummary {
  id: string
  name: string
  description: string
  appMode: string
  createdAt: string
  updatedAt: string
}

export interface StudioProject extends ProjectSummary {
  requirement: string
  dsl: string
  documentation: string
  generatedTests: string
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'applied' | 'failed'
export type ApprovalAction =
  | 'external-ai'
  | 'dify-run'
  | 'apply-fix'
  | 'export-dsl'
  | 'save-secret'
  | 'overwrite-file'

export interface ApprovalRequest {
  id: string
  projectId?: string
  action: ApprovalAction
  title: string
  summary: string
  risk: 'low' | 'medium' | 'high'
  status: ApprovalStatus
  diff?: string
  createdAt: string
  decidedAt?: string
}

export type ProviderType =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'groq'
  | 'kimi'
  | 'ollama'
  | 'lm-studio'
  | 'openai-compatible'

export interface AIProfile {
  id: string
  name: string
  type: ProviderType
  baseUrl: string
  model: string
  temperature: number
  maxTokens: number
  timeout: number
  streaming: boolean
  hasApiKey?: boolean
}

export interface DifyProfile {
  id: string
  name: string
  baseUrl: string
  appId?: string
  timeout: number
  streaming: boolean
  hasApiKey?: boolean
}

export interface RuntimeEngineStatus {
  available: boolean
  engine: 'graphon'
  engineVersion: string
  pythonVersion: string
  supportedPython: string
}

export interface RuntimeEngineResult extends SimulationResult {
  engine: RuntimeEngineStatus
}

export interface RuntimeStopResult {
  stopped: boolean
  standaloneRuns: number
  difyRequests: number
  remoteDifyTasks: number
}

export interface ApiRuntimeStatus {
  running: boolean
  baseUrl?: string
  apiKey?: string
  projectId?: string
  projectName?: string
  activeRuns: number
}

export interface DesktopApi {
  projects: {
    list(): Promise<ProjectSummary[]>
    get(id: string): Promise<StudioProject | null>
    save(project: Partial<StudioProject> & { name: string }): Promise<StudioProject>
    remove(id: string): Promise<void>
  }
  files: {
    importDsl(): Promise<{ path: string; content: string } | null>
    exportDsl(content: string, suggestedName: string): Promise<string | null>
    exportText(content: string, suggestedName: string, format: 'md' | 'html'): Promise<string | null>
  }
  settings: {
    listAI(): Promise<AIProfile[]>
    saveAI(profile: AIProfile, apiKey?: string): Promise<AIProfile>
    listDify(): Promise<DifyProfile[]>
    saveDify(profile: DifyProfile, apiKey?: string): Promise<DifyProfile>
  }
  approvals: {
    list(projectId?: string): Promise<ApprovalRequest[]>
    create(request: Omit<ApprovalRequest, 'id' | 'status' | 'createdAt'>): Promise<ApprovalRequest>
    decide(id: string, status: 'approved' | 'rejected' | 'applied' | 'failed'): Promise<ApprovalRequest>
  }
  runtime: {
    validate(content: string): Promise<ValidationResult>
    simulate(content: string, inputs: Record<string, unknown>, mocks: Record<string, unknown>): Promise<SimulationResult>
    standaloneStatus(): Promise<RuntimeEngineStatus>
    runStandalone(content: string, inputs: Record<string, unknown>, profileId?: string): Promise<RuntimeEngineResult>
    stop(): Promise<RuntimeStopResult>
    startApi(content: string, projectId: string, projectName: string, profileId?: string): Promise<ApiRuntimeStatus>
    stopApi(): Promise<ApiRuntimeStatus>
    apiStatus(): Promise<ApiRuntimeStatus>
    generateAI(profileId: string, prompt: string): Promise<{ text: string; model: string }>
    runDify(profileId: string, inputs: Record<string, unknown>, user: string): Promise<Record<string, unknown>>
    testDify(profileId: string): Promise<{ ok: boolean; message: string }>
    testAI(profileId: string): Promise<{ ok: boolean; message: string }>
  }
  platform: NodeJS.Platform | 'browser'
}

declare global {
  interface Window {
    studio?: DesktopApi
  }
}

export interface WorkspaceState {
  project?: StudioProject
  parsed?: DifyDsl
  validation?: ValidationResult
}
