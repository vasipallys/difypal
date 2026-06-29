import { create } from 'zustand'
import type {
  AIProfile,
  ApprovalRequest,
  DifyProfile,
  ProjectSummary,
  StudioProject,
  ApiRuntimeStatus,
} from '@/shared/types/desktop'
import type { DifyDsl, SimulationResult, ValidationResult } from '@/shared/types/dsl'
import type { WorkspaceTheme } from '@/renderer/lib/themes'
import { loadWorkspaceTheme } from '@/renderer/lib/themes'
import type { DslReviewReport } from '@/core/agents/dsl-review'

export type WorkspaceTab =
  | 'requirement'
  | 'editor'
  | 'visual'
  | 'debugger'
  | 'validation'
  | 'documentation'
  | 'tests'
  | 'review'
  | 'ai-settings'
  | 'dify-settings'
  | 'compatibility'

export interface DebuggerLaunchRequest {
  id: number
  mode: 'standalone' | 'dify'
}

interface WorkspaceStore {
  activeTab: WorkspaceTab
  project?: StudioProject
  projects: ProjectSummary[]
  content: string
  requirement: string
  parsed?: DifyDsl
  validation?: ValidationResult
  simulation?: SimulationResult
  documentation: string
  generatedTests: string
  proposedDsl?: string
  fixApprovalId?: string
  aiDslReview?: DslReviewReport
  debuggerLaunch?: DebuggerLaunchRequest
  apiRuntime?: ApiRuntimeStatus
  selectedNodeId?: string
  approvals: ApprovalRequest[]
  approvalPromptId?: string
  aiProfiles: AIProfile[]
  difyProfiles: DifyProfile[]
  busy: boolean
  notice?: string
  theme: WorkspaceTheme
  set: (patch: Partial<WorkspaceStore>) => void
}

export const useWorkspace = create<WorkspaceStore>(set => ({
  activeTab: 'requirement',
  projects: [],
  content: '',
  requirement: '',
  documentation: '',
  generatedTests: '',
  approvals: [],
  aiProfiles: [],
  difyProfiles: [],
  busy: false,
  theme: loadWorkspaceTheme(),
  set,
}))
