import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { parseDsl } from '@/core/dsl/parser'
import type { RuntimeEngineResult } from '@/shared/types/desktop'
import { RuntimeEngineBridge } from './runtime-engine'

export interface ApiRuntimeStatus {
  running: boolean
  baseUrl?: string
  apiKey?: string
  projectId?: string
  projectName?: string
  activeRuns: number
}

interface RuntimeConfig {
  dsl: string
  projectId: string
  projectName: string
  profile?: Record<string, unknown>
}

interface RunRecord {
  id: string
  taskId: string
  user: string
  inputs: Record<string, unknown>
  status: string
  createdAt: number
  finishedAt?: number
  result?: RuntimeEngineResult
}

const MAX_BODY = 2 * 1024 * 1024

export class DslApiRuntimeServer {
  private server?: Server
  private config?: RuntimeConfig
  private apiKey = ''
  private baseUrl = ''
  private readonly runs = new Map<string, RunRecord>()

  constructor(
    private readonly engine: RuntimeEngineBridge,
    private readonly rendererOrigin = 'null',
  ) {}

  async start(config: RuntimeConfig): Promise<ApiRuntimeStatus> {
    await this.stop()
    this.runs.clear()
    this.config = config
    this.apiKey = `dsl_${randomBytes(24).toString('hex')}`
    this.server = createServer((request, response) => {
      void this.handle(request, response).catch((error) => {
        this.json(response, 500, { error: error instanceof Error ? error.message : String(error) })
      })
    })
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(0, '127.0.0.1', () => resolve())
    })
    const address = this.server.address()
    if (!address || typeof address === 'string')
      throw new Error('Local API runtime did not obtain a TCP port.')
    this.baseUrl = `http://127.0.0.1:${address.port}/v1`
    return this.status()
  }

  async stop(): Promise<ApiRuntimeStatus> {
    for (const run of this.runs.values()) {
      if (run.status === 'running') {
        this.engine.stop(run.taskId)
        run.status = 'stopped'
        run.finishedAt = Date.now()
      }
    }
    if (this.server) {
      await new Promise<void>(resolve => this.server!.close(() => resolve()))
      this.server = undefined
    }
    this.config = undefined
    this.baseUrl = ''
    this.apiKey = ''
    return this.status()
  }

  status(): ApiRuntimeStatus {
    return {
      running: Boolean(this.server?.listening),
      baseUrl: this.baseUrl || undefined,
      apiKey: this.apiKey || undefined,
      projectId: this.config?.projectId,
      projectName: this.config?.projectName,
      activeRuns: [...this.runs.values()].filter(run => run.status === 'running').length,
    }
  }

  private authorized(request: IncomingMessage): boolean {
    const supplied = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '')
    const expected = Buffer.from(this.apiKey)
    const actual = Buffer.from(supplied)
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  }

  private async body(request: IncomingMessage): Promise<Record<string, unknown>> {
    let text = ''
    for await (const chunk of request) {
      text += String(chunk)
      if (Buffer.byteLength(text) > MAX_BODY)
        throw new Error('Request body exceeds 2 MB.')
    }
    const value = text ? JSON.parse(text) as unknown : {}
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Request body must be a JSON object.')
    return value as Record<string, unknown>
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.headers.origin === this.rendererOrigin)
      response.setHeader('Access-Control-Allow-Origin', this.rendererOrigin)
    response.setHeader('Vary', 'Origin')
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end()
      return
    }
    if (!this.config) {
      this.json(response, 503, { error: 'DSL API runtime is not configured.' })
      return
    }
    if (!this.authorized(request)) {
      this.json(response, 401, { error: 'Invalid API key.' })
      return
    }
    const url = new URL(request.url || '/', this.baseUrl)
    const path = url.pathname.replace(/^\/v1/, '')
    if (request.method === 'GET' && path === '/info') {
      const parsed = parseDsl(this.config.dsl).document
      this.json(response, 200, {
        name: parsed?.app?.name || this.config.projectName,
        description: parsed?.app?.description || '',
        tags: ['local', 'graphon'],
        mode: parsed?.app?.mode || 'workflow',
        author_name: 'Dify DSL Studio',
      })
      return
    }
    if (request.method === 'GET' && path === '/parameters') {
      const parsed = parseDsl(this.config.dsl).document
      const start = parsed?.workflow?.graph.nodes.find(node => node.data.type === 'start')
      const variables = Array.isArray(start?.data.variables) ? start.data.variables as Array<Record<string, unknown>> : []
      this.json(response, 200, {
        user_input_form: variables.map((variable) => {
          const type = String(variable.type || 'text-input')
          return { [type]: variable }
        }),
        ...(parsed?.workflow?.features || {}),
      })
      return
    }
    if (request.method === 'POST' && path === '/workflows/run') {
      const payload = await this.body(request)
      const inputs = payload.inputs && typeof payload.inputs === 'object' && !Array.isArray(payload.inputs)
        ? payload.inputs as Record<string, unknown>
        : {}
      const user = String(payload.user || 'local-api-user')
      const taskId = randomUUID()
      const runId = randomUUID()
      const run: RunRecord = { id: runId, taskId, user, inputs, status: 'running', createdAt: Date.now() }
      this.runs.set(runId, run)
      const execution = this.execute(run)
      if (payload.response_mode === 'streaming') {
        response.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        })
        response.write(`data: ${JSON.stringify({ event: 'workflow_started', task_id: taskId, workflow_run_id: runId })}\n\n`)
        const detail = await execution
        response.end(`data: ${JSON.stringify({ event: 'workflow_finished', task_id: taskId, workflow_run_id: runId, data: detail })}\n\n`)
        return
      }
      const detail = await execution
      this.json(response, 200, { task_id: taskId, workflow_run_id: runId, data: detail })
      return
    }
    const detailMatch = path.match(/^\/workflows\/run\/([^/]+)$/)
    if (request.method === 'GET' && detailMatch) {
      const run = this.runs.get(detailMatch[1]!)
      this.json(response, run ? 200 : 404, run ? this.detail(run) : { error: 'Workflow run not found.' })
      return
    }
    const stopMatch = path.match(/^\/workflows\/tasks\/([^/]+)\/stop$/)
    if (request.method === 'POST' && stopMatch) {
      const payload = await this.body(request)
      const run = [...this.runs.values()].find(item => item.taskId === stopMatch[1])
      if (!run || String(payload.user || '') !== run.user) {
        this.json(response, 404, { error: 'Active workflow task not found.' })
        return
      }
      this.engine.stop(run.taskId)
      run.status = 'stopped'
      run.finishedAt = Date.now()
      this.json(response, 200, { result: 'success' })
      return
    }
    this.json(response, 404, { error: 'API endpoint not found.' })
  }

  private async execute(run: RunRecord): Promise<Record<string, unknown>> {
    try {
      run.result = await this.engine.run({
        dsl: this.config!.dsl,
        inputs: run.inputs,
        profile: this.config!.profile,
        workflowId: run.taskId,
      })
      run.status = run.result.status
    }
    catch (error) {
      if (run.status !== 'stopped')
        run.status = 'failed'
      run.result = undefined
      return { ...this.detail(run), error: error instanceof Error ? error.message : String(error) }
    }
    finally {
      run.finishedAt = Date.now()
    }
    return this.detail(run)
  }

  private detail(run: RunRecord): Record<string, unknown> {
    return {
      id: run.id,
      workflow_id: this.config?.projectId,
      status: run.status,
      inputs: run.inputs,
      outputs: run.result?.outputs || {},
      error: run.result?.status === 'failed' ? run.result.warnings.join(' ') : null,
      total_steps: run.result?.trace.length || 0,
      total_tokens: 0,
      created_at: Math.floor(run.createdAt / 1000),
      finished_at: run.finishedAt ? Math.floor(run.finishedAt / 1000) : null,
      elapsed_time: run.finishedAt ? (run.finishedAt - run.createdAt) / 1000 : null,
    }
  }

  private json(response: ServerResponse, status: number, value: unknown): void {
    if (response.headersSent)
      return
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify(value))
  }
}
