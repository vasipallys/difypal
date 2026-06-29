import { afterEach, describe, expect, it, vi } from 'vitest'
import { DslApiRuntimeServer } from '../../electron/main/api-runtime'
import type { RuntimeEngineBridge } from '../../electron/main/runtime-engine'

const dsl = `version: 0.6.0
kind: app
app:
  name: API Test
  mode: workflow
  description: Local runtime test
workflow:
  graph:
    nodes:
      - id: start
        data:
          type: start
          variables:
            - variable: input
              label: Input
              type: text-input
              required: true
      - id: end
        data:
          type: end
          outputs: []
    edges:
      - source: start
        target: end
`

describe('local DSL API runtime', () => {
  let server: DslApiRuntimeServer | undefined

  afterEach(async () => {
    await server?.stop()
  })

  it('publishes authenticated Dify-compatible metadata and workflow execution', async () => {
    const engine = {
      run: vi.fn(async (request: { inputs: Record<string, unknown> }) => ({
        status: 'succeeded',
        outputs: { echoed: request.inputs.input },
        trace: [],
        warnings: [],
        engine: {
          available: true,
          engine: 'graphon',
          engineVersion: 'test',
          pythonVersion: 'test',
          supportedPython: 'test',
        },
      })),
      stop: vi.fn(() => 0),
    } as unknown as RuntimeEngineBridge
    server = new DslApiRuntimeServer(engine)
    const status = await server.start({
      dsl,
      projectId: 'project-1',
      projectName: 'API Test',
    })
    const headers = { Authorization: `Bearer ${status.apiKey}` }

    expect((await fetch(`${status.baseUrl}/info`)).status).toBe(401)
    const info = await fetch(`${status.baseUrl}/info`, { headers }).then(response => response.json())
    expect(info).toMatchObject({ name: 'API Test', mode: 'workflow' })
    const parameters = await fetch(`${status.baseUrl}/parameters`, { headers }).then(response => response.json())
    expect(parameters.user_input_form[0]['text-input'].variable).toBe('input')

    const runResponse = await fetch(`${status.baseUrl}/workflows/run`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: { input: 'hello API' },
        response_mode: 'blocking',
        user: 'test-user',
      }),
    }).then(response => response.json())
    expect(runResponse.data.outputs).toEqual({ echoed: 'hello API' })

    const detail = await fetch(
      `${status.baseUrl}/workflows/run/${runResponse.workflow_run_id}`,
      { headers },
    ).then(response => response.json())
    expect(detail.status).toBe('succeeded')
    expect(detail.inputs).toEqual({ input: 'hello API' })
  })

  it('allows preflight requests only from the configured renderer origin', async () => {
    const engine = {
      run: vi.fn(),
      stop: vi.fn(() => 0),
    } as unknown as RuntimeEngineBridge
    const rendererOrigin = 'http://127.0.0.1:5173'
    server = new DslApiRuntimeServer(engine, rendererOrigin)
    const status = await server.start({
      dsl,
      projectId: 'project-1',
      projectName: 'API Test',
    })

    const allowed = await fetch(`${status.baseUrl}/info`, {
      method: 'OPTIONS',
      headers: {
        Origin: rendererOrigin,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization',
      },
    })
    expect(allowed.status).toBe(204)
    expect(allowed.headers.get('access-control-allow-origin')).toBe(rendererOrigin)
    expect(allowed.headers.get('access-control-allow-methods')).toBe('GET, POST, OPTIONS')

    const rejected = await fetch(`${status.baseUrl}/info`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://example.com',
        'Access-Control-Request-Method': 'GET',
      },
    })
    expect(rejected.status).toBe(204)
    expect(rejected.headers.get('access-control-allow-origin')).toBeNull()
  })
})
