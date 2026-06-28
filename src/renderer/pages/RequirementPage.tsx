import { ArrowRight, BrainCircuit, CheckCircle2, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { runOfflinePipeline } from '@/core/agents/pipeline'
import { buildDslGenerationPrompt, extractDslFromModelResponse } from '@/core/agents/llm-generation'
import { generateDocumentation } from '@/core/docs/generator'
import { generateTestPlan } from '@/core/tests-generator/generator'
import { parseDsl } from '@/core/dsl/parser'
import { desktop } from '@/renderer/lib/desktop-api'
import { useWorkspace } from '@/renderer/stores/workspace'

function fingerprint(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function RequirementPage() {
  const { requirement, project, aiProfiles, approvals, busy, set } = useWorkspace()
  const [mode, setMode] = useState<'workflow' | 'advanced-chat'>(
    project?.appMode === 'advanced-chat' ? 'advanced-chat' : 'workflow',
  )
  const [profileId, setProfileId] = useState('local')

  const generate = async () => {
    if (!requirement.trim()) {
      set({ notice: 'Describe what the workflow should do first.' })
      return
    }
    const baseline = runOfflinePipeline(requirement, mode)
    if (profileId === 'local') {
      set({
        content: baseline.dsl,
        parsed: baseline.document,
        validation: baseline.validation,
        documentation: baseline.documentation,
        generatedTests: baseline.tests,
        activeTab: 'editor',
        notice: `Draft generated locally with ${Math.round(baseline.confidence * 100)}% confidence. No data left this device.`,
      })
      return
    }

    const profile = aiProfiles.find(item => item.id === profileId)
    if (!profile) {
      set({ notice: 'The selected AI profile no longer exists.' })
      return
    }
    const requestFingerprint = fingerprint(`${profile.id}:${profile.model}:${mode}:${requirement}`)
    const approvalTitle = `Generate DSL with ${profile.name} [${requestFingerprint}]`
    const approved = approvals.find(item =>
      item.action === 'external-ai'
      && item.title === approvalTitle
      && item.status === 'approved',
    )
    if (!approved) {
      const request = await desktop.approvals.create({
        projectId: project?.id,
        action: 'external-ai',
        title: approvalTitle,
        summary: `Send the requirement and a secret-free baseline DSL to model "${profile.model}" through profile "${profile.name}". The encrypted API key stays in the Electron main process.`,
        risk: 'medium',
      })
      set({
        approvals: [request, ...approvals],
        activeTab: 'review',
        notice: 'Approve this model call, then return to Requirement and generate again.',
      })
      return
    }

    set({ busy: true, notice: `Loading ${profile.model} through ${profile.name}…` })
    try {
      const prompt = buildDslGenerationPrompt(requirement, mode, baseline.dsl)
      const response = await desktop.runtime.generateAI(profile.id, prompt)
      const generatedDsl = extractDslFromModelResponse(response.text)
      const [validation, parsed] = await Promise.all([
        desktop.runtime.validate(generatedDsl),
        Promise.resolve(parseDsl(generatedDsl)),
      ])
      const updatedApproval = await desktop.approvals.decide(approved.id, 'applied')
      set({
        content: generatedDsl,
        parsed: parsed.document,
        validation,
        documentation: parsed.document ? generateDocumentation(parsed.document, validation) : '',
        generatedTests: parsed.document ? generateTestPlan(parsed.document) : '',
        approvals: approvals.map(item => item.id === approved.id ? updatedApproval : item),
        activeTab: validation.valid ? 'visual' : 'validation',
        busy: false,
        notice: validation.valid
          ? `DSL generated with ${response.model} and validated successfully.`
          : `${response.model} returned DSL with ${validation.issues.filter(item => item.severity === 'error').length} blocking issues.`,
      })
    }
    catch (error) {
      const updatedApproval = await desktop.approvals.decide(approved.id, 'failed')
      set({
        approvals: approvals.map(item => item.id === approved.id ? updatedApproval : item),
        busy: false,
        notice: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return (
    <div className="page-scroll">
      <section className="hero-panel">
        <div>
          <span className="eyebrow"><Sparkles size={13} /> Offline-first agentic pipeline</span>
          <h2>Turn a requirement into an import-ready Dify workflow.</h2>
          <p>Plan, generate, validate, visualize, document, and test locally. External AI remains optional and approval-gated.</p>
        </div>
        <div className="confidence-card">
          <BrainCircuit size={26} />
          <strong>Private by default</strong>
          <span>The built-in architect creates a safe draft without an API key.</span>
        </div>
      </section>

      <section className="form-card requirement-card">
        <div className="field-row">
          <label>
            Application type
            <select value={mode} onChange={event => setMode(event.target.value as typeof mode)}>
              <option value="workflow">Workflow</option>
              <option value="advanced-chat">Chatflow (advanced-chat)</option>
            </select>
          </label>
          <label>
            Generation model
            <select value={profileId} onChange={event => setProfileId(event.target.value)}>
              <option value="local">Built-in local architect — no model or key</option>
              {aiProfiles.map(profile => (
                <option value={profile.id} key={profile.id}>
                  {profile.name} — {profile.model}{profile.hasApiKey ? ' · encrypted key' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          What should this workflow accomplish?
          <textarea
            data-testid="requirement-input"
            value={requirement}
            onChange={event => set({ requirement: event.target.value })}
            placeholder="Example: Review a support ticket, retrieve relevant policy, draft a grounded response, and require human approval for refunds over $100."
            rows={10}
          />
        </label>
        <div className="prompt-hints">
          <span><CheckCircle2 size={13} /> Inputs & expected output</span>
          <span><CheckCircle2 size={13} /> Tools or APIs</span>
          <span><CheckCircle2 size={13} /> Knowledge / RAG</span>
          <span><CheckCircle2 size={13} /> Approval & error paths</span>
        </div>
        <div className="form-actions">
          <p>{profileId === 'local'
            ? 'Generation is deterministic and stays on this device.'
            : 'The selected model and encrypted key are loaded only in Electron after approval.'}</p>
          <button data-testid="generate-dsl" className="button accent large" onClick={generate} disabled={busy}>
            {busy ? 'Generating…' : profileId === 'local' ? 'Generate local draft' : 'Generate with selected model'} <ArrowRight size={16} />
          </button>
        </div>
      </section>
    </div>
  )
}
