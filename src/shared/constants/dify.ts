export const OFFICIAL_DIFY_COMMIT = '7a111c22260bf41af38a1452a34a7b2cd16668e3'
export const OFFICIAL_DIFY_DSL_VERSION = '0.6.0'

export const WORKFLOW_MODES = ['workflow', 'advanced-chat'] as const
export const CONFIG_ONLY_MODES = ['completion', 'chat', 'agent-chat', 'channel'] as const

export const SUPPORTED_NODE_TYPES = [
  'start',
  'end',
  'answer',
  'llm',
  'knowledge-retrieval',
  'question-classifier',
  'if-else',
  'code',
  'template-transform',
  'http-request',
  'tool',
  'datasource',
  'variable-aggregator',
  'variable-assigner',
  'assigner',
  'parameter-extractor',
  'iteration',
  'iteration-start',
  'loop',
  'loop-start',
  'loop-end',
  'document-extractor',
  'list-operator',
  'agent',
  'agent-v2',
  'human-input',
  'knowledge-index',
  'trigger-schedule',
  'trigger-webhook',
  'trigger-plugin',
] as const

export const SYSTEM_VARIABLES = new Set([
  'sys.query',
  'sys.files',
  'sys.conversation_id',
  'sys.user_id',
  'sys.app_id',
  'sys.workflow_id',
  'sys.workflow_run_id',
  'sys.timestamp',
])

export const REQUIRED_NODE_FIELDS: Record<string, string[]> = {
  start: ['variables'],
  end: ['outputs'],
  answer: ['answer'],
  llm: ['model', 'prompt_template', 'context'],
  code: ['variables', 'code_language', 'code', 'outputs'],
  'document-extractor': ['variable_selector'],
  'http-request': ['method', 'url', 'authorization', 'headers', 'params'],
  'if-else': [],
  iteration: ['iterator_selector', 'output_selector'],
  'list-operator': ['variable', 'filter_by', 'order_by', 'limit'],
  loop: ['loop_count', 'break_conditions', 'logical_operator'],
  'parameter-extractor': ['model', 'query', 'parameters', 'reasoning_mode'],
  'question-classifier': ['query_variable_selector', 'model', 'classes'],
  'template-transform': ['variables', 'template'],
  tool: ['provider_id', 'provider_type', 'provider_name', 'tool_name', 'tool_label', 'tool_configurations', 'tool_parameters'],
  'variable-aggregator': ['output_type', 'variables'],
  assigner: ['items'],
  'knowledge-retrieval': ['query_variable_selector', 'dataset_ids', 'retrieval_mode'],
  'human-input': [],
}
