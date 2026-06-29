import type { DifyDsl, DifyEdge, DifyNode } from '@/shared/types/dsl'
import { serializeDsl } from '@/core/dsl/parser'

export type StarterTemplateId =
  | 'blank-workflow'
  | 'basic-llm'
  | 'router'
  | 'rag'
  | 'api-tool'
  | 'human-approval'
  | 'evaluator-refiner'
  | 'document-creator'

export interface StarterTemplate {
  id: StarterTemplateId
  title: string
  family: string
  pattern: string
  description: string
  flow: string[]
  bestFor: string
}

export interface StarterDslResult extends StarterTemplate {
  dsl: string
  document: DifyDsl
}

export const starterTemplates: StarterTemplate[] = [
  {
    id: 'blank-workflow',
    title: 'True blank workflow',
    family: 'Topology & Distribution',
    pattern: 'Workflow Graph / State Machine',
    description: 'A minimal valid DSL scaffold with one input and one output. Use this when you want the canvas but no opinionated agent behavior yet.',
    flow: ['Start', 'End'],
    bestFor: 'Manually building a workflow from scratch while keeping validation green.',
  },
  {
    id: 'basic-llm',
    title: 'Basic LLM workflow',
    family: 'Sequential & Conditional Pipelines',
    pattern: 'Prompt Chaining Pipeline',
    description: 'The simplest useful agentic workflow: receive user input, run a constrained model prompt, and return the result.',
    flow: ['Start', 'LLM', 'End'],
    bestFor: 'Summarizers, classifiers, rewrite tools, extractors, and single-step assistants.',
  },
  {
    id: 'router',
    title: 'Router workflow',
    family: 'Routing & Selection',
    pattern: 'Intent Classification / Router',
    description: 'Classify the request once, then dispatch to specialized branches with their own prompts and outputs.',
    flow: ['Start', 'Question classifier', 'Specialist branch', 'End'],
    bestFor: 'Support triage, difficulty routing, department routing, and model/tool selection.',
  },
  {
    id: 'rag',
    title: 'Grounded RAG workflow',
    family: 'Grounding & Retrieval',
    pattern: 'Retrieval-Augmented Generation',
    description: 'Retrieve trusted context first, then ask the model to answer only from that context and say when evidence is missing.',
    flow: ['Start', 'Knowledge retrieval', 'Grounded LLM', 'End'],
    bestFor: 'Knowledge-base chat, policy Q&A, documentation assistants, and citation-heavy answers.',
  },
  {
    id: 'api-tool',
    title: 'API/tool workflow',
    family: 'Tool Use & Integration',
    pattern: 'API Orchestration / Function Calling',
    description: 'Extract parameters, call an external HTTP/API placeholder, then normalize the response into a clean output.',
    flow: ['Start', 'Parameter extractor', 'HTTP request', 'Response template', 'End'],
    bestFor: 'Lookup tools, enrichment APIs, ticket updates, CRM actions, and workflow automation.',
  },
  {
    id: 'human-approval',
    title: 'Human approval workflow',
    family: 'Human Oversight',
    pattern: 'Human Approval Gate',
    description: 'Prepare a proposal, pause for human approval, then continue only after a person reviews the proposed action.',
    flow: ['Start', 'Proposal LLM', 'Human approval', 'End'],
    bestFor: 'Publishing, sending messages, destructive actions, spend approvals, and regulated decisions.',
  },
  {
    id: 'evaluator-refiner',
    title: 'Evaluator/refiner workflow',
    family: 'Evaluation, Critique & Verification',
    pattern: 'Evaluator-Optimizer / Reflection',
    description: 'Draft once, critique the draft, and route to either final output or a revision node based on the critique.',
    flow: ['Start', 'Draft', 'Critique', 'Quality gate', 'Revise or End'],
    bestFor: 'High-quality writing, rubric-based outputs, validation loops, and safer generated content.',
  },
  {
    id: 'document-creator',
    title: 'Multi-section document creator',
    family: 'Orchestration & Multi-Agent',
    pattern: 'Orchestrator-Workers',
    description: 'Plan sections, fan out to section writers, collect the sections, and polish the final document.',
    flow: ['Start', 'Planner', 'Section workers', 'Aggregator', 'Polish', 'End'],
    bestFor: 'Reports, guides, RFP responses, release notes, and structured long-form content.',
  },
]

const starterById = new Map(starterTemplates.map(template => [template.id, template]))

const baseFeatures = {
  file_upload: { enabled: false },
  opening_statement: '',
  retriever_resource: { enabled: true },
  sensitive_word_avoidance: { enabled: false },
  speech_to_text: { enabled: false },
  suggested_questions: [],
  suggested_questions_after_answer: { enabled: false },
  text_to_speech: { enabled: false },
}

function model() {
  return {
    provider: 'langgenius/openai/openai',
    name: 'gpt-4o-mini',
    mode: 'chat',
    completion_params: { temperature: 0.3 },
  }
}

function startNode(x = 80, y = 240): DifyNode {
  return {
    id: 'start',
    type: 'custom',
    position: { x, y },
    data: {
      type: 'start',
      title: 'User Input',
      variables: [{
        variable: 'input',
        label: 'Input',
        type: 'paragraph',
        required: true,
        max_length: 4096,
        options: [],
      }],
    },
  }
}

function endNode(id: string, title: string, selector: string[], x: number, y: number): DifyNode {
  return {
    id,
    type: 'custom',
    position: { x, y },
    data: {
      type: 'end',
      title,
      outputs: [{ variable: 'result', value_selector: selector, value_type: 'string' }],
    },
  }
}

function llmNode(
  id: string,
  title: string,
  systemPrompt: string,
  userPrompt: string,
  x: number,
  y: number,
  context?: Record<string, unknown>,
): DifyNode {
  return {
    id,
    type: 'custom',
    position: { x, y },
    data: {
      type: 'llm',
      title,
      model: model(),
      prompt_template: [
        { role: 'system', text: systemPrompt },
        { role: 'user', text: userPrompt },
      ],
      prompt_config: { jinja2_variables: [] },
      context: context ?? { enabled: false, variable_selector: [] },
      vision: { enabled: false },
    },
  }
}

function edge(source: string, target: string, sourceType: string, targetType: string, sourceHandle = 'source'): DifyEdge {
  return {
    id: `${source}-${sourceHandle}-${target}-target`,
    source,
    target,
    sourceHandle,
    targetHandle: 'target',
    type: 'custom',
    data: { sourceType, targetType },
  }
}

function workflowDsl(name: string, description: string, nodes: DifyNode[], edges: DifyEdge[]): DifyDsl {
  return {
    version: '0.6.0',
    kind: 'app',
    app: {
      name,
      mode: 'workflow',
      icon: '🧩',
      icon_type: 'emoji',
      icon_background: '#E8F3FF',
      description,
      use_icon_as_answer_icon: false,
    },
    dependencies: [],
    workflow: {
      conversation_variables: [],
      environment_variables: [],
      rag_pipeline_variables: [],
      features: baseFeatures,
      graph: {
        nodes,
        edges,
        viewport: { x: 0, y: 0, zoom: 0.85 },
      },
    },
  }
}

function createBlankWorkflow(): DifyDsl {
  const start = startNode()
  const end = endNode('end', 'Output', ['start', 'input'], 390, 240)
  return workflowDsl(
    'Blank workflow',
    'A minimal Start to End workflow scaffold.',
    [start, end],
    [edge('start', 'end', 'start', 'end')],
  )
}

function createBasicLlm(): DifyDsl {
  const start = startNode()
  const llm = llmNode(
    'llm_generate',
    'Generate response',
    'You are a careful workflow step. Transform the user input into the requested result. Respond with a concise final answer. If the request is missing required information, say what is missing and do not invent facts.',
    '{{#start.input#}}',
    390,
    240,
  )
  const end = endNode('end', 'Output', ['llm_generate', 'text'], 700, 240)
  return workflowDsl(
    'Basic LLM workflow',
    'Start with one constrained model step and one output.',
    [start, llm, end],
    [edge('start', 'llm_generate', 'start', 'llm'), edge('llm_generate', 'end', 'llm', 'end')],
  )
}

function createRouter(): DifyDsl {
  const start = startNode(70, 270)
  const classifier: DifyNode = {
    id: 'classify_intent',
    type: 'custom',
    position: { x: 360, y: 270 },
    data: {
      type: 'question-classifier',
      title: 'Classify intent',
      query_variable_selector: ['start', 'input'],
      model: model(),
      classes: [
        { id: 'billing', name: 'Billing', description: 'Payment, invoice, plan, refund, or account billing questions.' },
        { id: 'technical', name: 'Technical', description: 'Bug reports, troubleshooting, setup, or integration questions.' },
        { id: 'general', name: 'General', description: 'Anything that does not fit the other specialist routes.' },
      ],
    },
  }
  const billing = llmNode('billing_handler', 'Billing specialist', 'Handle billing requests. Ask for missing account context when needed. Output a clear next step and do not promise refunds without approval.', '{{#start.input#}}', 670, 100)
  const technical = llmNode('technical_handler', 'Technical specialist', 'Handle technical support requests. Provide diagnostic steps, assumptions, and safe next actions. If unknown, say what evidence is needed.', '{{#start.input#}}', 670, 270)
  const general = llmNode('general_handler', 'General specialist', 'Handle general requests. Answer directly and safely. If the request is ambiguous, ask one clarifying question.', '{{#start.input#}}', 670, 440)
  const billingEnd = endNode('billing_end', 'Billing output', ['billing_handler', 'text'], 980, 100)
  const technicalEnd = endNode('technical_end', 'Technical output', ['technical_handler', 'text'], 980, 270)
  const generalEnd = endNode('general_end', 'General output', ['general_handler', 'text'], 980, 440)
  return workflowDsl(
    'Router workflow',
    'Classify the request and dispatch it to a specialist branch.',
    [start, classifier, billing, technical, general, billingEnd, technicalEnd, generalEnd],
    [
      edge('start', 'classify_intent', 'start', 'question-classifier'),
      edge('classify_intent', 'billing_handler', 'question-classifier', 'llm', 'billing'),
      edge('classify_intent', 'technical_handler', 'question-classifier', 'llm', 'technical'),
      edge('classify_intent', 'general_handler', 'question-classifier', 'llm', 'general'),
      edge('billing_handler', 'billing_end', 'llm', 'end'),
      edge('technical_handler', 'technical_end', 'llm', 'end'),
      edge('general_handler', 'general_end', 'llm', 'end'),
    ],
  )
}

function createRag(): DifyDsl {
  const start = startNode()
  const retrieval: DifyNode = {
    id: 'retrieve_context',
    type: 'custom',
    position: { x: 360, y: 240 },
    data: {
      type: 'knowledge-retrieval',
      title: 'Retrieve trusted context',
      query_variable_selector: ['start', 'input'],
      dataset_ids: [],
      retrieval_mode: 'single',
      multiple_retrieval_config: { reranking_enable: false, top_k: 4, score_threshold: 0.3 },
    },
  }
  const llm = llmNode(
    'grounded_answer',
    'Grounded answer',
    'Answer only from the retrieved context. Include concise citations or source names when available. If the retrieved context is insufficient, say that the evidence is insufficient instead of guessing. Output a final answer.',
    'Question:\n{{#start.input#}}\n\nRetrieved context:\n{{#retrieve_context.text#}}',
    670,
    240,
    { enabled: true, variable_selector: ['retrieve_context', 'result'] },
  )
  const end = endNode('end', 'Grounded output', ['grounded_answer', 'text'], 980, 240)
  return workflowDsl(
    'Grounded RAG workflow',
    'Retrieve trusted context before generating the answer.',
    [start, retrieval, llm, end],
    [
      edge('start', 'retrieve_context', 'start', 'knowledge-retrieval'),
      edge('retrieve_context', 'grounded_answer', 'knowledge-retrieval', 'llm'),
      edge('grounded_answer', 'end', 'llm', 'end'),
    ],
  )
}

function createApiTool(): DifyDsl {
  const start = startNode(70, 250)
  const extractor: DifyNode = {
    id: 'extract_parameters',
    type: 'custom',
    position: { x: 350, y: 250 },
    data: {
      type: 'parameter-extractor',
      title: 'Extract API parameters',
      model: model(),
      query: '{{#start.input#}}',
      reasoning_mode: 'prompt',
      parameters: [{
        name: 'resource_id',
        type: 'string',
        description: 'Identifier or lookup key needed by the API.',
        required: false,
      }],
    },
  }
  const http: DifyNode = {
    id: 'call_api',
    type: 'custom',
    position: { x: 640, y: 250 },
    data: {
      type: 'http-request',
      title: 'Call external API',
      method: 'GET',
      url: 'https://api.example.com/resource/{{#extract_parameters.resource_id#}}',
      authorization: { type: 'no-auth' },
      headers: [],
      params: [],
      body: { type: 'none' },
      timeout: { connect: 10, read: 60, write: 20 },
    },
  }
  const template: DifyNode = {
    id: 'format_response',
    type: 'custom',
    position: { x: 930, y: 250 },
    data: {
      type: 'template-transform',
      title: 'Format API response',
      variables: [{ variable: 'api_response', value_selector: ['call_api', 'text'] }],
      template: 'API response summary:\n{{ api_response }}',
    },
  }
  const end = endNode('end', 'API output', ['format_response', 'output'], 1220, 250)
  return workflowDsl(
    'API tool workflow',
    'Extract parameters, call an API placeholder, and normalize the response.',
    [start, extractor, http, template, end],
    [
      edge('start', 'extract_parameters', 'start', 'parameter-extractor'),
      edge('extract_parameters', 'call_api', 'parameter-extractor', 'http-request'),
      edge('call_api', 'format_response', 'http-request', 'template-transform'),
      edge('format_response', 'end', 'template-transform', 'end'),
    ],
  )
}

function createHumanApproval(): DifyDsl {
  const start = startNode()
  const proposal = llmNode(
    'prepare_proposal',
    'Prepare proposal',
    'Prepare a concise proposal for the requested action. Include intent, important inputs, risks, and the exact action to approve. Do not execute the action. Output in a review-friendly format.',
    '{{#start.input#}}',
    390,
    240,
  )
  const approval: DifyNode = {
    id: 'human_approval',
    type: 'custom',
    position: { x: 700, y: 240 },
    data: {
      type: 'human-input',
      title: 'Human approval',
      desc: 'Pause here until a person reviews the proposal and approves or rejects the action.',
      variables: [{ variable: 'proposal', value_selector: ['prepare_proposal', 'text'] }],
    },
  }
  const end = endNode('end', 'Approved output', ['prepare_proposal', 'text'], 1010, 240)
  return workflowDsl(
    'Human approval workflow',
    'Prepare a proposal and pause for human review before continuing.',
    [start, proposal, approval, end],
    [
      edge('start', 'prepare_proposal', 'start', 'llm'),
      edge('prepare_proposal', 'human_approval', 'llm', 'human-input'),
      edge('human_approval', 'end', 'human-input', 'end'),
    ],
  )
}

function createEvaluatorRefiner(): DifyDsl {
  const start = startNode(70, 280)
  const draft = llmNode(
    'draft_response',
    'Draft response',
    'Create a high-quality draft for the user request. Use clear structure, state assumptions, and output the draft only. If facts are missing, mark them as unknown instead of inventing.',
    '{{#start.input#}}',
    360,
    280,
  )
  const critic = llmNode(
    'critique_draft',
    'Critique draft',
    'Evaluate the draft against correctness, completeness, clarity, and safety. Respond with APPROVED if it is ready. Otherwise respond with NEEDS_REVISION and specific feedback.',
    'User request:\n{{#start.input#}}\n\nDraft:\n{{#draft_response.text#}}',
    650,
    280,
  )
  const gate: DifyNode = {
    id: 'quality_gate',
    type: 'custom',
    position: { x: 940, y: 280 },
    data: {
      type: 'if-else',
      title: 'Quality gate',
      cases: [{
        case_id: 'approved',
        logical_operator: 'and',
        conditions: [{
          variable_selector: ['critique_draft', 'text'],
          comparison_operator: 'contains',
          value: 'APPROVED',
        }],
      }],
    },
  }
  const revise = llmNode(
    'revise_response',
    'Revise response',
    'Revise the draft using the critique. Output the improved final answer only. Preserve factual uncertainty and do not invent missing facts.',
    'User request:\n{{#start.input#}}\n\nDraft:\n{{#draft_response.text#}}\n\nCritique:\n{{#critique_draft.text#}}',
    1230,
    410,
  )
  const approvedEnd = endNode('approved_end', 'Approved output', ['draft_response', 'text'], 1230, 160)
  const revisedEnd = endNode('revised_end', 'Revised output', ['revise_response', 'text'], 1530, 410)
  return workflowDsl(
    'Evaluator refiner workflow',
    'Draft, critique, then either finish or revise once.',
    [start, draft, critic, gate, approvedEnd, revise, revisedEnd],
    [
      edge('start', 'draft_response', 'start', 'llm'),
      edge('draft_response', 'critique_draft', 'llm', 'llm'),
      edge('critique_draft', 'quality_gate', 'llm', 'if-else'),
      edge('quality_gate', 'approved_end', 'if-else', 'end', 'approved'),
      edge('quality_gate', 'revise_response', 'if-else', 'llm', 'false'),
      edge('revise_response', 'revised_end', 'llm', 'end'),
    ],
  )
}

function createDocumentCreator(): DifyDsl {
  const start = startNode(70, 300)
  const planner = llmNode(
    'plan_sections',
    'Plan sections',
    'Create a short document plan with exactly three sections: overview, details, and next steps. Output concise section briefs. If the request is vague, make conservative assumptions and state them.',
    '{{#start.input#}}',
    360,
    300,
  )
  const overview = llmNode('write_overview', 'Write overview', 'Write the overview section from the plan. Keep it concise and factual. Output only this section.', 'Request:\n{{#start.input#}}\n\nPlan:\n{{#plan_sections.text#}}', 660, 120)
  const details = llmNode('write_details', 'Write details', 'Write the details section from the plan. Use clear bullets where helpful. Output only this section.', 'Request:\n{{#start.input#}}\n\nPlan:\n{{#plan_sections.text#}}', 660, 300)
  const nextSteps = llmNode('write_next_steps', 'Write next steps', 'Write the next steps section from the plan. Keep actions concrete. Output only this section.', 'Request:\n{{#start.input#}}\n\nPlan:\n{{#plan_sections.text#}}', 660, 480)
  const aggregate: DifyNode = {
    id: 'collect_sections',
    type: 'custom',
    position: { x: 970, y: 300 },
    data: {
      type: 'variable-aggregator',
      title: 'Collect sections',
      output_type: 'string',
      variables: [
        ['write_overview', 'text'],
        ['write_details', 'text'],
        ['write_next_steps', 'text'],
      ],
    },
  }
  const polish = llmNode(
    'polish_document',
    'Polish document',
    'Combine and polish the sections into one coherent final document. Preserve the intended headings. Remove duplication. If information is unknown, state that it is unknown.',
    'Overview:\n{{#write_overview.text#}}\n\nDetails:\n{{#write_details.text#}}\n\nNext steps:\n{{#write_next_steps.text#}}',
    1280,
    300,
  )
  const end = endNode('end', 'Document output', ['polish_document', 'text'], 1590, 300)
  return workflowDsl(
    'Multi-section document creator',
    'Plan, fan out section writers, collect the sections, and polish.',
    [start, planner, overview, details, nextSteps, aggregate, polish, end],
    [
      edge('start', 'plan_sections', 'start', 'llm'),
      edge('plan_sections', 'write_overview', 'llm', 'llm'),
      edge('plan_sections', 'write_details', 'llm', 'llm'),
      edge('plan_sections', 'write_next_steps', 'llm', 'llm'),
      edge('write_overview', 'collect_sections', 'llm', 'variable-aggregator'),
      edge('write_details', 'collect_sections', 'llm', 'variable-aggregator'),
      edge('write_next_steps', 'collect_sections', 'llm', 'variable-aggregator'),
      edge('collect_sections', 'polish_document', 'variable-aggregator', 'llm'),
      edge('polish_document', 'end', 'llm', 'end'),
    ],
  )
}

function documentFor(id: StarterTemplateId): DifyDsl {
  switch (id) {
    case 'blank-workflow': return createBlankWorkflow()
    case 'basic-llm': return createBasicLlm()
    case 'router': return createRouter()
    case 'rag': return createRag()
    case 'api-tool': return createApiTool()
    case 'human-approval': return createHumanApproval()
    case 'evaluator-refiner': return createEvaluatorRefiner()
    case 'document-creator': return createDocumentCreator()
  }
}

export function createStarterDsl(id: StarterTemplateId): StarterDslResult {
  const template = starterById.get(id)
  if (!template)
    throw new Error(`Unknown starter template: ${id}`)
  const document = documentFor(id)
  return {
    ...template,
    document,
    dsl: serializeDsl(document),
  }
}
