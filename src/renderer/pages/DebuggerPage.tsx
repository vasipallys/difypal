import { AlertTriangle, ArrowRight, Bug, CirclePause, CirclePlay, FlaskConical, Server } from 'lucide-react'
import { useState } from 'react'
import { desktop } from '@/renderer/lib/desktop-api'
import { useWorkspace } from '@/renderer/stores/workspace'

export function DebuggerPage() {
  const { content, simulation, difyProfiles, busy, set } = useWorkspace()
  const [inputs, setInputs] = useState('{\n  "input": "Hello from Dify DSL Studio"\n}')
  const [mocks, setMocks] = useState('{}')
  const [mode, setMode] = useState<'simulate' | 'dify'>('simulate')
  const [profileId, setProfileId] = useState('')
  const [runError, setRunError] = useState('')

  const run = async () => {
    setRunError('')
    try {
      const parsedInputs = JSON.parse(inputs) as Record<string, unknown>
      const parsedMocks = JSON.parse(mocks) as Record<string, unknown>
      if (mode === 'simulate') {
        set({ busy: true })
        const result = await desktop.runtime.simulate(content, parsedInputs, parsedMocks)
        set({ simulation: result, busy: false, notice: `Simulation ${result.status}.` })
        return
      }
      if (!profileId)
        throw new Error('Choose a Dify profile first.')
      const profileName = difyProfiles.find(item => item.id === profileId)?.name ?? profileId
      const approved = useWorkspace.getState().approvals.find(item =>
        item.action === 'dify-run'
        && item.title.includes(profileName)
        && item.status === 'approved',
      )
      if (approved) {
        set({ busy: true })
        const result = await desktop.runtime.runDify(profileId, parsedInputs, 'dify-dsl-studio')
        const applied = await desktop.approvals.decide(approved.id, 'applied')
        set({
          approvals: useWorkspace.getState().approvals.map(item => item.id === approved.id ? applied : item),
          busy: false,
          notice: `Dify run completed: ${JSON.stringify(result).slice(0, 180)}`,
        })
        return
      }
      const approval = await desktop.approvals.create({
        projectId: useWorkspace.getState().project?.id,
        action: 'dify-run',
        title: `Run against Dify: ${profileName}`,
        summary: `Send these input fields to ${profileName}: ${Object.keys(parsedInputs).join(', ') || '(none)'}`,
        risk: 'high',
      })
      set({ approvals: [approval, ...useWorkspace.getState().approvals], activeTab: 'review', notice: 'Approve the real Dify run in the review queue.' })
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setRunError(message)
      set({ busy: false, notice: message })
    }
  }

  return (
    <div className="debug-layout">
      <section className="debug-config">
        <div className="section-heading">
          <span className="eyebrow"><Bug size={13} /> Safe runner</span>
          <h2>Execute with a visible trace</h2>
          <p>Code and external nodes are inert locally. Add explicit mock outputs keyed by node ID.</p>
        </div>
        <div className="mode-switch">
          <button className={mode === 'simulate' ? 'active' : ''} onClick={() => setMode('simulate')}><FlaskConical /> Simulation</button>
          <button className={mode === 'dify' ? 'active' : ''} onClick={() => setMode('dify')}><Server /> Dify API</button>
        </div>
        {mode === 'dify' && (
          <label>
            Dify profile
            <select value={profileId} onChange={event => setProfileId(event.target.value)}>
              <option value="">Choose a configured instance</option>
              {difyProfiles.map(profile => <option value={profile.id} key={profile.id}>{profile.name}</option>)}
            </select>
          </label>
        )}
        <label>Input variables<textarea value={inputs} onChange={event => setInputs(event.target.value)} rows={8} className="code-input" /></label>
        <label>Mock node outputs<textarea value={mocks} onChange={event => setMocks(event.target.value)} rows={8} className="code-input" /></label>
        {runError && <p className="debug-input-error"><AlertTriangle size={14} /> {runError}</p>}
        <button data-testid="run-debugger" className="button accent large" disabled={busy || !content.trim()} onClick={run}><CirclePlay size={16} /> {busy ? 'Running…' : mode === 'simulate' ? 'Run simulation' : 'Request real run'}</button>
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
                <h2>Simulation blocked by DSL errors</h2>
                <p>The safe runner validates the workflow before traversal. Resolve these errors, then run again.</p>
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
                  <pre>{JSON.stringify({ inputs: step.inputs, outputs: step.outputs }, null, 2)}</pre>
                </details>
              </div>
            </article>
          ))}
          {simulation && simulation.trace.length > 0 && simulation.warnings.length > 0 && (
            <div className="simulation-warnings">
              <strong>Simulation notes</strong>
              {simulation.warnings.map((warning, index) => <p key={`${index}:${warning}`}>{warning}</p>)}
            </div>
          )}
          {!simulation && <div className="empty-state"><FlaskConical /><h2>Ready to simulate</h2><p>Provide inputs and optional mocks, then run.</p></div>}
        </div>
      </section>
    </div>
  )
}
