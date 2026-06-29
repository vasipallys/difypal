import {
  AlertTriangle,
  ArrowRight,
  Bug,
  CirclePause,
  CirclePlay,
  Cpu,
  FlaskConical,
  Server,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { isLoopbackAIProfile } from '@/core/ai/presets'
import { desktop } from '@/renderer/lib/desktop-api'
import { useWorkspace } from '@/renderer/stores/workspace'
import { ApiTesterModal } from '@/renderer/components/ApiTesterModal'
import type { RuntimeEngineStatus } from '@/shared/types/desktop'
import type { DifyDsl } from '@/shared/types/dsl'

interface Props {
  onStartApi: () => Promise<boolean>
}

function fingerprint(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function defaultInputsFor(dsl?: DifyDsl): Record<string, unknown> {
  const start = dsl?.workflow?.graph.nodes.find(node => node.data.type === 'start')
  const variables = Array.isArray(start?.data.variables)
    ? start.data.variables as Array<Record<string, unknown>>
    : []
  return Object.fromEntries(variables.flatMap((variable) => {
    const name = String(variable.variable ?? '')
    if (!name)
      return []
    const type = String(variable.type ?? '')
    const options = Array.isArray(variable.options) ? variable.options : []
    const value = variable.default
      ?? (type === 'number' ? 0
        : type === 'checkbox' || type === 'boolean' ? false
          : options[0] ?? `Hello from ${name}`)
    return [[name, value]]
  }))
}

export function DebuggerPage({ onStartApi }: Props) {
  const {
    content,
    parsed,
    simulation,
    aiProfiles,
    difyProfiles,
    debuggerLaunch,
    apiRuntime,
    busy,
    set,
  } = useWorkspace()
  const [inputs, setInputs] = useState('{\n  "input": "Hello from Dify DSL Studio"\n}')
  const [mocks, setMocks] = useState('{}')
  const [mode, setMode] = useState<'simulate' | 'standalone' | 'dify'>('simulate')
  const [profileId, setProfileId] = useState('')
  const [runError, setRunError] = useState('')
  const [engineStatus, setEngineStatus] = useState<RuntimeEngineStatus>()
  const [engineStatusError, setEngineStatusError] = useState('')
  const [showApiTester, setShowApiTester] = useState(false)
  const [startingApi, setStartingApi] = useState(false)
  const startVariableSignature = useRef('')
  const handledLaunchId = useRef<number | undefined>(undefined)

  useEffect(() => {
    const start = parsed?.workflow?.graph.nodes.find(node => node.data.type === 'start')
    const variables = Array.isArray(start?.data.variables) ? start.data.variables as Array<Record<string, unknown>> : []
    const names = variables
      .map(variable => String(variable.variable ?? ''))
      .filter(Boolean)
    const signature = `${start?.id ?? ''}:${names.join(',')}`
    if (!names.length || signature === startVariableSignature.current)
      return
    startVariableSignature.current = signature
    setInputs(JSON.stringify(defaultInputsFor(parsed), null, 2))
  }, [parsed])

  useEffect(() => {
    void desktop.runtime.standaloneStatus()
      .then((status) => {
        setEngineStatus(status)
        setEngineStatusError('')
      })
      .catch(error => setEngineStatusError(error instanceof Error ? error.message : String(error)))
  }, [])

  const runStandalone = async (
    parsedInputs: Record<string, unknown>,
    selectedProfileId?: string,
  ) => {
    const profile = selectedProfileId
      ? aiProfiles.find(item => item.id === selectedProfileId)
      : undefined
    const modelNodes = new Set(['llm', 'question-classifier', 'parameter-extractor'])
    const requiresModel = parsed?.workflow?.graph.nodes.some(node => modelNodes.has(node.data.type))
    if (requiresModel && !profile)
      throw new Error('Choose an AI profile for this workflow’s model nodes.')

    const execute = async (approvalId?: string) => {
      set({ busy: true, notice: 'Running the workflow with the standalone Graphon engine…' })
      try {
        const result = await desktop.runtime.runStandalone(content, parsedInputs, profile?.id)
        let nextApprovals = useWorkspace.getState().approvals
        if (approvalId) {
          const decided = await desktop.approvals.decide(
            approvalId,
            result.status === 'failed' ? 'failed' : 'applied',
          )
          nextApprovals = nextApprovals.map(item => item.id === approvalId ? decided : item)
        }
        set({
          simulation: result,
          approvals: nextApprovals,
          busy: false,
          notice: `Graphon ${result.engine.engineVersion} run ${result.status}.`,
        })
      }
      catch (error) {
        if (approvalId) {
          const failed = await desktop.approvals.decide(approvalId, 'failed')
          set({
            approvals: useWorkspace.getState().approvals.map(item => item.id === approvalId ? failed : item),
          })
        }
        throw error
      }
    }

    const externalNodeTypes = new Set([
      'http-request',
      'tool',
      'knowledge-retrieval',
      'datasource',
      'agent',
      'agent-v2',
      'code',
    ])
    const externalNodes = parsed?.workflow?.graph.nodes
      .filter(node => externalNodeTypes.has(node.data.type))
      .map(node => node.data.title ?? node.data.type) ?? []
    const hostedModel = Boolean(profile && !isLoopbackAIProfile(profile))
    if (!hostedModel && externalNodes.length === 0) {
      await execute()
      return
    }

    const runFingerprint = fingerprint(
      `${profile?.id ?? 'no-profile'}:${profile?.model ?? ''}:${content}:${JSON.stringify(parsedInputs)}`,
    )
    const targetName = profile?.name ?? 'external-capable nodes'
    const approvalTitle = `Run standalone Graphon with ${targetName} [${runFingerprint}]`
    const approved = useWorkspace.getState().approvals.find(item =>
      item.action === 'external-ai'
      && item.title === approvalTitle
      && item.status === 'approved',
    )
    if (approved) {
      await execute(approved.id)
      return
    }
    const pending = useWorkspace.getState().approvals.find(item =>
      item.action === 'external-ai'
      && item.title === approvalTitle
      && item.status === 'pending',
    )
    if (pending) {
      set({ approvalPromptId: pending.id, notice: 'Approve the pending standalone engine run.' })
      return
    }
    const request = await desktop.approvals.create({
      projectId: useWorkspace.getState().project?.id,
      action: 'external-ai',
      title: approvalTitle,
      summary: `Run the current DSL with official Graphon. Input fields: ${Object.keys(parsedInputs).join(', ') || 'none'}. ${hostedModel ? `Model prompts may be sent through ${profile?.name}. ` : ''}${externalNodes.length ? `External-capable nodes: ${externalNodes.join(', ')}. ` : ''}Encrypted credentials are loaded only in Electron main memory.`,
      risk: externalNodes.length ? 'high' : 'medium',
    })
    set({
      approvals: [request, ...useWorkspace.getState().approvals],
      approvalPromptId: request.id,
      notice: 'Approve the standalone Graphon model call, then run again when ready.',
    })
  }

  const run = async (request?: {
    mode?: 'simulate' | 'standalone' | 'dify'
    profileId?: string
    parsedInputs?: Record<string, unknown>
  }) => {
    setRunError('')
    try {
      const runMode = request?.mode ?? mode
      const selectedProfileId = request?.profileId ?? profileId
      const parsedInputs = request?.parsedInputs ?? JSON.parse(inputs) as Record<string, unknown>
      if (runMode === 'simulate') {
        const parsedMocks = JSON.parse(mocks) as Record<string, unknown>
        set({ busy: true })
        const result = await desktop.runtime.simulate(content, parsedInputs, parsedMocks)
        set({ simulation: result, busy: false, notice: `Simulation ${result.status}.` })
        return
      }
      if (runMode === 'standalone') {
        if (engineStatusError)
          throw new Error(engineStatusError)
        await runStandalone(parsedInputs, selectedProfileId || undefined)
        return
      }
      if (!selectedProfileId)
        throw new Error('Choose a Dify profile first.')
      const profileName = difyProfiles.find(item => item.id === selectedProfileId)?.name ?? selectedProfileId
      const approved = useWorkspace.getState().approvals.find(item =>
        item.action === 'dify-run'
        && item.title.includes(profileName)
        && item.status === 'approved',
      )
      if (approved) {
        set({ busy: true })
        const result = await desktop.runtime.runDify(selectedProfileId, parsedInputs, 'dify-dsl-studio')
        const applied = await desktop.approvals.decide(approved.id, 'applied')
        set({
          approvals: useWorkspace.getState().approvals.map(item => item.id === approved.id ? applied : item),
          busy: false,
          notice: `Dify run completed: ${JSON.stringify(result).slice(0, 180)}`,
        })
        return
      }
      const pending = useWorkspace.getState().approvals.find(item =>
        item.action === 'dify-run'
        && item.title.includes(profileName)
        && item.status === 'pending',
      )
      const approval = pending ?? await desktop.approvals.create({
        projectId: useWorkspace.getState().project?.id,
        action: 'dify-run',
        title: `Run against Dify: ${profileName}`,
        summary: `Send these input fields to ${profileName}: ${Object.keys(parsedInputs).join(', ') || '(none)'}`,
        risk: 'high',
      })
      set({
        approvals: pending ? useWorkspace.getState().approvals : [approval, ...useWorkspace.getState().approvals],
        approvalPromptId: approval.id,
        notice: 'Approve the real Dify run, then run again when ready.',
      })
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setRunError(message)
      set({ busy: false, notice: message })
    }
  }

  useEffect(() => {
    if (!debuggerLaunch || handledLaunchId.current === debuggerLaunch.id || !parsed)
      return
    if (debuggerLaunch.mode === 'standalone' && !engineStatus && !engineStatusError)
      return
    handledLaunchId.current = debuggerLaunch.id
    const selectedProfileId = debuggerLaunch.mode === 'standalone'
      ? aiProfiles[0]?.id ?? ''
      : difyProfiles[0]?.id ?? ''
    const preparedInputs = defaultInputsFor(parsed)
    setMode(debuggerLaunch.mode)
    setProfileId(selectedProfileId)
    setInputs(JSON.stringify(preparedInputs, null, 2))
    set({ debuggerLaunch: undefined })
    void run({
      mode: debuggerLaunch.mode,
      profileId: selectedProfileId,
      parsedInputs: preparedInputs,
    })
  }, [debuggerLaunch, parsed, engineStatus, engineStatusError, aiProfiles, difyProfiles])

  const runLabel = busy
    ? 'Running…'
    : mode === 'simulate'
      ? 'Run simulation'
      : mode === 'standalone'
        ? 'Run with Graphon'
        : 'Request real run'

  const openApiTester = async () => {
    if (apiRuntime?.running) {
      setShowApiTester(true)
      return
    }
    setStartingApi(true)
    try {
      if (await onStartApi())
        setShowApiTester(true)
    }
    finally {
      setStartingApi(false)
    }
  }

  return (
    <div className="debug-layout">
      <section className="debug-config">
        <div className="section-heading">
          <span className="eyebrow"><Bug size={13} /> Runtime runner</span>
          <h2>Execute with a visible trace</h2>
          <p>
            {mode === 'standalone'
              ? 'Run locally with the official Graphon engine extracted from Dify. External model calls remain approval-gated.'
              : mode === 'simulate'
                ? 'Safe structural simulation keeps code and external nodes inert and uses explicit mocks.'
                : 'Send the workflow inputs to a configured Dify application API.'}
          </p>
        </div>
        <div className="mode-switch three">
          <button className={mode === 'simulate' ? 'active' : ''} onClick={() => { setMode('simulate'); setProfileId('') }}><FlaskConical /> Simulation</button>
          <button className={mode === 'standalone' ? 'active' : ''} onClick={() => { setMode('standalone'); setProfileId('') }}><Cpu /> Graphon</button>
          <button className={mode === 'dify' ? 'active' : ''} onClick={() => { setMode('dify'); setProfileId('') }}><Server /> Dify API</button>
        </div>
        {mode === 'standalone' && (
          <>
            <div data-testid="engine-status" className={engineStatus ? 'engine-status ready' : 'engine-status'}>
              <Cpu size={14} />
              <span>
                {engineStatus
                  ? `Graphon ${engineStatus.engineVersion} · Python ${engineStatus.pythonVersion}`
                  : engineStatusError || 'Checking standalone runtime…'}
              </span>
            </div>
            <label>
              AI profile for model nodes
              <select data-testid="standalone-profile" value={profileId} onChange={event => setProfileId(event.target.value)}>
                <option value="">None — deterministic nodes only</option>
                {aiProfiles.map(profile => <option value={profile.id} key={profile.id}>{profile.name} — {profile.model}</option>)}
              </select>
            </label>
          </>
        )}
        {mode === 'dify' && (
          <label>
            Dify profile
            <select value={profileId} onChange={event => setProfileId(event.target.value)}>
              <option value="">Choose a configured instance</option>
              {difyProfiles.map(profile => <option value={profile.id} key={profile.id}>{profile.name}</option>)}
            </select>
          </label>
        )}
        <label>Input variables<textarea data-testid="debug-inputs" value={inputs} onChange={event => setInputs(event.target.value)} rows={8} className="code-input" /></label>
        {mode === 'simulate' && (
          <label>Mock node outputs<textarea value={mocks} onChange={event => setMocks(event.target.value)} rows={8} className="code-input" /></label>
        )}
        {runError && <p className="debug-input-error"><AlertTriangle size={14} /> {runError}</p>}
        {apiRuntime?.running && (
          <div className="api-runtime-card" data-testid="api-runtime-card">
            <strong>Local Dify-compatible API</strong>
            <label>Base URL<input readOnly value={apiRuntime.baseUrl ?? ''} /></label>
            <label>Bearer API key<input readOnly value={apiRuntime.apiKey ?? ''} /></label>
            <code>POST /workflows/run</code>
            <code>GET /parameters · GET /info</code>
            <code>GET /workflows/run/:id</code>
            <code>POST /workflows/tasks/:task_id/stop</code>
          </div>
        )}
        <div className="debug-run-actions">
          <button data-testid="run-debugger" className="button accent large" disabled={busy || !content.trim()} onClick={() => void run()}>
            <CirclePlay size={16} /> {runLabel}
          </button>
          <button
            data-testid="open-api-tester"
            className="button ghost large"
            disabled={startingApi || busy || !content.trim()}
            title={apiRuntime?.running ? 'Test the local runtime endpoints' : 'Start the local API runtime and open its tester'}
            onClick={() => void openApiTester()}
          >
            <Server size={15} /> {startingApi ? 'Starting local APIs…' : 'Test local APIs'}
          </button>
        </div>
      </section>
      <section className="trace-panel">
        <div className="panel-toolbar">
          <div><CirclePause size={15} /> Execution trace</div>
          <span className={`trace-status ${simulation?.status ?? ''}`}>{simulation?.status ?? 'not run'}</span>
        </div>
        <div className="trace-list">
          {simulation?.status === 'failed' && simulation.trace.length === 0 && (
            <div className="simulation-blocked" data-testid="simulation-blocked">
              <AlertTriangle />
              <div>
                <h2>Execution blocked</h2>
                <p>Review the runtime or validation errors below, then run again.</p>
                <ul>
                  {simulation.warnings.map((warning, index) => <li key={`${index}:${warning}`}>{warning}</li>)}
                </ul>
                <button className="button ghost" onClick={() => set({ activeTab: 'validation' })}>
                  Open Validation <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}
          {simulation?.trace.map((step, index) => (
            <article className="trace-step" key={step.id}>
              <span className="trace-index">{index + 1}</span>
              <div>
                <div className="trace-title"><strong>{step.title}</strong><code>{step.nodeType}</code><span className={step.status}>{step.status}</span></div>
                {step.message && <p>{step.message}</p>}
                <details>
                  <summary>Inputs & outputs</summary>
                  <pre data-testid="trace-json" tabIndex={0}>{JSON.stringify({ inputs: step.inputs, outputs: step.outputs }, null, 2)}</pre>
                </details>
              </div>
            </article>
          ))}
          {simulation && simulation.trace.length > 0 && simulation.warnings.length > 0 && (
            <div className="simulation-warnings">
              <strong>Runtime notes</strong>
              {simulation.warnings.map((warning, index) => <p key={`${index}:${warning}`}>{warning}</p>)}
            </div>
          )}
          {!simulation && <div className="empty-state"><FlaskConical /><h2>Ready to run</h2><p>Choose a runtime, provide inputs, then run.</p></div>}
        </div>
      </section>
      {showApiTester && apiRuntime?.running && (
        <ApiTesterModal runtime={apiRuntime} dsl={parsed} onClose={() => setShowApiTester(false)} />
      )}
    </div>
  )
}
