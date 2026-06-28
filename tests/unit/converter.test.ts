import { describe, expect, it } from 'vitest'
import { toFlowGraph } from '@/core/graph/converter'
import type { DifyDsl } from '@/shared/types/dsl'

function workflowWithSourceHandle(sourceHandle: string): DifyDsl {
  return {
    version: '0.6.0',
    kind: 'app',
    app: {
      name: 'Handle conversion',
      mode: 'workflow',
    },
    workflow: {
      graph: {
        nodes: [
          {
            id: 'start',
            data: { type: 'start', title: 'Start' },
          },
          {
            id: 'llm',
            data: { type: 'llm', title: 'LLM' },
          },
        ],
        edges: [
          {
            id: 'start-to-llm',
            source: 'start',
            target: 'llm',
            sourceHandle,
            targetHandle: 'target',
            data: {
              sourceType: 'start',
              targetType: 'llm',
            },
          },
        ],
      },
    },
  }
}

describe('React Flow graph conversion', () => {
  it('creates explicit workflow nodes with visible presentation data', () => {
    const node = toFlowGraph(workflowWithSourceHandle('source')).nodes[0]

    expect(node?.type).toBe('workflow')
    expect(node?.data).toMatchObject({
      label: 'Start',
      nodeType: 'start',
      accent: '#46d38a',
    })
  })

  it('does not treat Dify handle metadata as rendered React Flow handle IDs', () => {
    const edge = toFlowGraph(workflowWithSourceHandle('source')).edges[0]

    expect(edge).not.toHaveProperty('sourceHandle')
    expect(edge).not.toHaveProperty('targetHandle')
    expect(edge?.data).toEqual({
      difySourceHandle: 'source',
      difyTargetHandle: 'target',
      sourceType: 'start',
      targetType: 'llm',
    })
    expect(edge?.label).toBeUndefined()
  })

  it('keeps branch handle names as edge labels and metadata', () => {
    const edge = toFlowGraph(workflowWithSourceHandle('case-1')).edges[0]

    expect(edge?.label).toBe('case-1')
    expect(edge?.data?.difySourceHandle).toBe('case-1')
  })
})
