export const CURRENT_DIFY_DSL_VERSION = '0.6.0'

export type AppMode =
  | 'workflow'
  | 'advanced-chat'
  | 'completion'
  | 'chat'
  | 'agent-chat'
  | 'agent'
  | 'channel'
  | 'rag-pipeline'

export type DifyNodeType =
  | 'start'
  | 'end'
  | 'answer'
  | 'llm'
  | 'knowledge-retrieval'
  | 'question-classifier'
  | 'if-else'
  | 'code'
  | 'template-transform'
  | 'http-request'
  | 'tool'
  | 'datasource'
  | 'variable-aggregator'
  | 'variable-assigner'
  | 'assigner'
  | 'parameter-extractor'
  | 'iteration'
  | 'iteration-start'
  | 'loop'
  | 'loop-start'
  | 'loop-end'
  | 'document-extractor'
  | 'list-operator'
  | 'agent'
  | 'agent-v2'
  | 'human-input'
  | 'knowledge-index'
  | 'trigger-schedule'
  | 'trigger-webhook'
  | 'trigger-plugin'
  | string

export interface Position {
  x: number
  y: number
}

export interface DifyNode {
  id: string
  type?: string
  position?: Position
  positionAbsolute?: Position
  data: {
    type: DifyNodeType
    title?: string
    desc?: string
    version?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface DifyEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  type?: string
  data?: {
    sourceType?: DifyNodeType
    targetType?: DifyNodeType
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface RuntimeVariable {
  id: string
  name: string
  value: unknown
  value_type: string
  description?: string
}

export interface DifyDsl {
  version: string
  kind: 'app'
  app: {
    name: string
    mode: AppMode
    icon?: string
    icon_type?: 'emoji' | 'image' | 'link'
    icon_background?: string
    description?: string
    use_icon_as_answer_icon?: boolean
  }
  workflow?: {
    graph: {
      nodes: DifyNode[]
      edges: DifyEdge[]
      viewport?: { x: number; y: number; zoom: number }
    }
    features?: Record<string, unknown>
    environment_variables?: RuntimeVariable[]
    conversation_variables?: RuntimeVariable[]
    rag_pipeline_variables?: unknown[]
  }
  model_config?: Record<string, unknown>
  dependencies?: Array<Record<string, unknown>>
  [key: string]: unknown
}

export type IssueSeverity = 'error' | 'warning' | 'info'
export type IssueCategory =
  | 'yaml'
  | 'schema'
  | 'graph'
  | 'variable'
  | 'security'
  | 'compatibility'
  | 'prompt'

export interface ValidationIssue {
  id: string
  category: IssueCategory
  severity: IssueSeverity
  code: string
  message: string
  path?: string
  nodeId?: string
  suggestion?: string
}

export interface ValidationResult {
  valid: boolean
  version?: string
  mode?: AppMode
  issues: ValidationIssue[]
}

export interface ParseResult {
  document?: DifyDsl
  errors: ValidationIssue[]
}

export interface TraceStep {
  id: string
  nodeId: string
  nodeType: string
  title: string
  status: 'waiting' | 'running' | 'succeeded' | 'failed' | 'mocked' | 'paused' | 'skipped'
  startedAt: string
  finishedAt?: string
  inputs: Record<string, unknown>
  outputs: Record<string, unknown>
  message?: string
}

export interface SimulationResult {
  status: 'succeeded' | 'failed' | 'paused'
  outputs: Record<string, unknown>
  trace: TraceStep[]
  warnings: string[]
}
