import { describe, expect, it } from 'vitest'
import { updateNodeInDsl } from '@/core/dsl/node-editor'
import { parseDsl } from '@/core/dsl/parser'

const source = `version: 0.6.0
kind: app
app:
  name: Editable
  mode: workflow
workflow:
  graph:
    nodes:
      - id: start-1
        type: custom
        position: { x: 10, y: 20 }
        positionAbsolute: { x: 10, y: 20 }
        data:
          type: start
          title: Original
          desc: Old description
          variables: []
    edges: []
`

describe('node DSL editor', () => {
  it('updates editable fields while preserving the node identity and type', () => {
    const updated = updateNodeInDsl(source, 'start-1', {
      title: 'Updated start',
      description: 'New description',
      position: { x: 125, y: 240 },
      configuration: {
        variables: [{ variable: 'query', type: 'text-input', required: true }],
      },
    })
    const node = parseDsl(updated).document?.workflow?.graph.nodes[0]

    expect(node?.id).toBe('start-1')
    expect(node?.data.type).toBe('start')
    expect(node?.data.title).toBe('Updated start')
    expect(node?.data.desc).toBe('New description')
    expect(node?.data.variables).toEqual([{ variable: 'query', type: 'text-input', required: true }])
    expect(node?.position).toEqual({ x: 125, y: 240 })
    expect(node?.positionAbsolute).toEqual({ x: 125, y: 240 })
  })

  it('updates only position for a graph drag', () => {
    const updated = updateNodeInDsl(source, 'start-1', { position: { x: 300, y: 400 } })
    const node = parseDsl(updated).document?.workflow?.graph.nodes[0]

    expect(node?.data.title).toBe('Original')
    expect(node?.position).toEqual({ x: 300, y: 400 })
  })
})
