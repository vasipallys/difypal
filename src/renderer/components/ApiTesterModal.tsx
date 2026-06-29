import { Play, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ApiRuntimeStatus } from '@/shared/types/desktop'
import type { DifyDsl } from '@/shared/types/dsl'

type Operation = 'info' | 'parameters' | 'run-blocking' | 'run-streaming' | 'run-detail' | 'stop-task'

interface Props {
  runtime: ApiRuntimeStatus
  dsl?: DifyDsl
  onClose: () => void
}

interface InputDefinition {
  variable: string
  label: string
  type: string
  required: boolean
  options: unknown[]
  defaultValue: unknown
}

function inputDefinitions(dsl?: DifyDsl): InputDefinition[] {
  const start = dsl?.workflow?.graph.nodes.find(node => node.data.type === 'start')
  const variables = Array.isArray(start?.data.variables)
    ? start.data.variables as Array<Record<string, unknown>>
    : []
  return variables.flatMap((variable) => {
    const name = String(variable.variable ?? '')
    if (!name)
      return []
    return [{
      variable: name,
      label: String(variable.label ?? name),
      type: String(variable.type ?? 'text-input'),
      required: Boolean(variable.required),
      options: Array.isArray(variable.options) ? variable.options : [],
      defaultValue: variable.default ?? '',
    }]
  })
}

function typedValue(value: string, type: string): unknown {
  if (type === 'number')
    return Number(value)
  if (type === 'checkbox' || type === 'boolean')
    return value === 'true'
  if (type === 'json' || type === 'json-object')
    return JSON.parse(value || '{}') as unknown
  return value
}

export function ApiTesterModal({ runtime, dsl, onClose }: Props) {
  const definitions = useMemo(() => inputDefinitions(dsl), [dsl])
  const [operation, setOperation] = useState<Operation>('run-blocking')
  const [user, setUser] = useState('local-api-user')
  const [workflowRunId, setWorkflowRunId] = useState('')
  const [taskId, setTaskId] = useState('')
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(definitions.map(input => [input.variable, String(input.defaultValue ?? '')])),
  )
  const [result, setResult] = useState('Ready.')
  const [busy, setBusy] = useState(false)

  const execute = async () => {
    if (!runtime.baseUrl || !runtime.apiKey)
      return setResult('The local API runtime is not available.')
    setBusy(true)
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${runtime.apiKey}`,
      }
      let path = '/info'
      let method = 'GET'
      let body: string | undefined
      if (operation === 'parameters')
        path = '/parameters'
      if (operation === 'run-detail')
        path = `/workflows/run/${encodeURIComponent(workflowRunId)}`
      if (operation === 'run-blocking' || operation === 'run-streaming') {
        path = '/workflows/run'
        method = 'POST'
        headers['Content-Type'] = 'application/json'
        const inputs = Object.fromEntries(definitions.map(input => [
          input.variable,
          typedValue(values[input.variable] ?? '', input.type),
        ]))
        body = JSON.stringify({
          inputs,
          response_mode: operation === 'run-streaming' ? 'streaming' : 'blocking',
          user,
        })
      }
      if (operation === 'stop-task') {
        path = `/workflows/tasks/${encodeURIComponent(taskId)}/stop`
        method = 'POST'
        headers['Content-Type'] = 'application/json'
        body = JSON.stringify({ user })
      }
      const response = await fetch(`${runtime.baseUrl}${path}`, { method, headers, body })
      const text = await response.text()
      let formatted = text
      try {
        formatted = JSON.stringify(JSON.parse(text), null, 2)
      }
      catch {
        // Streaming SSE is intentionally shown as received.
      }
      setResult(`HTTP ${response.status}\n${formatted}`)
    }
    catch (error) {
      setResult(error instanceof Error ? error.message : String(error))
    }
    finally {
      setBusy(false)
    }
  }

  const isRun = operation === 'run-blocking' || operation === 'run-streaming'

  return (
    <div className="api-tester-backdrop" role="presentation">
      <section className="api-tester-modal" role="dialog" aria-modal="true" aria-labelledby="api-tester-title">
        <header>
          <div>
            <span className="eyebrow">Local Graphon runtime</span>
            <h2 id="api-tester-title">Test configured APIs</h2>
          </div>
          <button aria-label="Close API tester" className="icon-button" onClick={onClose}><X size={16} /></button>
        </header>
        <div className="api-tester-grid">
          <div className="api-tester-form">
            <label>
              API operation
              <select data-testid="api-operation" value={operation} onChange={event => setOperation(event.target.value as Operation)}>
                <option value="run-blocking">Run workflow — blocking</option>
                <option value="run-streaming">Run workflow — streaming</option>
                <option value="info">Get app info</option>
                <option value="parameters">Get input parameters</option>
                <option value="run-detail">Get workflow run detail</option>
                <option value="stop-task">Stop workflow task</option>
              </select>
            </label>
            <label>Base URL<input readOnly value={runtime.baseUrl ?? ''} /></label>
            {(isRun || operation === 'stop-task') && (
              <label>User identifier<input data-testid="api-user" value={user} onChange={event => setUser(event.target.value)} /></label>
            )}
            {isRun && definitions.map(input => (
              <label key={input.variable}>
                {input.label}{input.required ? ' *' : ''}
                {input.options.length
                  ? (
                      <select
                        data-testid={`api-input-${input.variable}`}
                        value={values[input.variable] ?? ''}
                        onChange={event => setValues(current => ({ ...current, [input.variable]: event.target.value }))}
                      >
                        <option value="">Choose…</option>
                        {input.options.map(option => <option value={String(option)} key={String(option)}>{String(option)}</option>)}
                      </select>
                    )
                  : input.type === 'paragraph'
                    ? (
                        <textarea
                          data-testid={`api-input-${input.variable}`}
                          rows={4}
                          value={values[input.variable] ?? ''}
                          onChange={event => setValues(current => ({ ...current, [input.variable]: event.target.value }))}
                        />
                      )
                    : (
                        <input
                          data-testid={`api-input-${input.variable}`}
                          type={input.type === 'number' ? 'number' : 'text'}
                          value={values[input.variable] ?? ''}
                          onChange={event => setValues(current => ({ ...current, [input.variable]: event.target.value }))}
                        />
                      )}
                <small>{input.variable} · {input.type}</small>
              </label>
            ))}
            {operation === 'run-detail' && (
              <label>Workflow run ID<input data-testid="api-run-id" value={workflowRunId} onChange={event => setWorkflowRunId(event.target.value)} /></label>
            )}
            {operation === 'stop-task' && (
              <label>Task ID<input data-testid="api-task-id" value={taskId} onChange={event => setTaskId(event.target.value)} /></label>
            )}
            <button
              data-testid="send-api-request"
              className="button accent large"
              disabled={busy || (operation === 'run-detail' && !workflowRunId) || (operation === 'stop-task' && !taskId)}
              onClick={() => void execute()}
            >
              <Play size={14} /> {busy ? 'Sending…' : 'Send request'}
            </button>
          </div>
          <div className="api-tester-response">
            <span>Response</span>
            <pre data-testid="api-response" tabIndex={0}>{result}</pre>
          </div>
        </div>
      </section>
    </div>
  )
}
