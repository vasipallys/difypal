import type { AppMode, DifyDsl } from '@/shared/types/dsl'
import { serializeDsl } from './parser'

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`
}

export function generateDraftFromRequirement(
  requirement: string,
  mode: Extract<AppMode, 'workflow' | 'advanced-chat'>,
  provider = 'langgenius/openai/openai',
  model = 'gpt-4o-mini',
): string {
  const startId = id('start')
  const llmId = id('llm')
  const terminalId = id(mode === 'advanced-chat' ? 'answer' : 'end')
  const terminalType = mode === 'advanced-chat' ? 'answer' : 'end'
  const terminalData = mode === 'advanced-chat'
    ? { type: terminalType, title: 'Answer', answer: `{{#${llmId}.text#}}`, variables: [] }
    : {
        type: terminalType,
        title: 'Output',
        outputs: [{ variable: 'result', value_selector: [llmId, 'text'], value_type: 'string' }],
      }

  const dsl: DifyDsl = {
    version: '0.6.0',
    kind: 'app',
    app: {
      name: requirement.trim().split(/\s+/).slice(0, 6).join(' ') || 'Untitled workflow',
      mode,
      icon: '🧭',
      icon_type: 'emoji',
      icon_background: '#E8F3FF',
      description: requirement.trim(),
      use_icon_as_answer_icon: false,
    },
    dependencies: [],
    workflow: {
      conversation_variables: [],
      environment_variables: [],
      rag_pipeline_variables: [],
      features: {
        file_upload: { enabled: false },
        opening_statement: '',
        retriever_resource: { enabled: true },
        sensitive_word_avoidance: { enabled: false },
        speech_to_text: { enabled: false },
        suggested_questions: [],
        suggested_questions_after_answer: { enabled: false },
        text_to_speech: { enabled: false },
      },
      graph: {
        nodes: [
          {
            id: startId,
            type: 'custom',
            position: { x: 80, y: 240 },
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
          },
          {
            id: llmId,
            type: 'custom',
            position: { x: 390, y: 240 },
            data: {
              type: 'llm',
              title: 'Generate response',
              model: {
                provider,
                name: model,
                mode: 'chat',
                completion_params: { temperature: 0.3 },
              },
              prompt_template: [{
                role: 'system',
                text: `You are the execution model inside an already-running Dify workflow. Apply the workflow behavior directly to the supplied user input.\n\nWorkflow behavior:\n${requirement.trim()}\n\nThe workflow has already been built. If the behavior is phrased as "create a workflow" or "build a workflow", interpret it as the processing that this running workflow must perform. Return only the requested result for the user input. Do not describe workflow design, implementation steps, nodes, or preprocessing. Do not invent missing facts, and state uncertainty clearly.`,
              }, {
                role: 'user',
                text: `{{#${startId}.input#}}`,
              }],
              prompt_config: { jinja2_variables: [] },
              context: { enabled: false, variable_selector: [] },
              vision: { enabled: false },
            },
          },
          {
            id: terminalId,
            type: 'custom',
            position: { x: 700, y: 240 },
            data: terminalData,
          },
        ],
        edges: [
          {
            id: `${startId}-source-${llmId}-target`,
            source: startId,
            target: llmId,
            sourceHandle: 'source',
            targetHandle: 'target',
            type: 'custom',
            data: { sourceType: 'start', targetType: 'llm' },
          },
          {
            id: `${llmId}-source-${terminalId}-target`,
            source: llmId,
            target: terminalId,
            sourceHandle: 'source',
            targetHandle: 'target',
            type: 'custom',
            data: { sourceType: 'llm', targetType: terminalType },
          },
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    },
  }
  return serializeDsl(dsl)
}
