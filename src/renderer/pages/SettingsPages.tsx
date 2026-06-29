import { KeyRound, PlugZap, Save, Server, ShieldCheck } from 'lucide-react'
import { useState, type PropsWithChildren } from 'react'
import type { AIProfile, ApprovalRequest, DifyProfile, ProviderType } from '@/shared/types/desktop'
import { getProviderPreset, isLoopbackAIProfile, PROVIDER_PRESETS } from '@/core/ai/presets'
import { desktop } from '@/renderer/lib/desktop-api'
import { useWorkspace } from '@/renderer/stores/workspace'

export function AISettingsPage() {
  const { aiProfiles, approvals, set } = useWorkspace()
  const [profile, setProfile] = useState<AIProfile>({
    id: crypto.randomUUID(),
    name: 'Local Ollama',
    type: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    model: 'llama3.2',
    temperature: 0.3,
    maxTokens: 2048,
    timeout: 60000,
    streaming: true,
  })
  const [apiKey, setApiKey] = useState('')
  const [testMessage, setTestMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const secretApprovalTitle = `Save encrypted credential for ${profile.name} [${profile.id}]`
  const testApprovalTitle = `Test external AI profile: ${profile.name} [${profile.id}]`
  const matchesProfileApproval = (request: ApprovalRequest, action: ApprovalRequest['action'], title: string) =>
    request.action === action
    && (request.title === title || (!request.title.includes('[') && request.title.includes(profile.name)))
  const secretApproval = approvals.find(request => matchesProfileApproval(request, 'save-secret', secretApprovalTitle))
  const testApproval = approvals.find(request => matchesProfileApproval(request, 'external-ai', testApprovalTitle))
  const savedProfile = aiProfiles.find(item => item.id === profile.id)
  const isLocalEndpoint = isLoopbackAIProfile(profile)

  const update = <K extends keyof AIProfile>(key: K, value: AIProfile[K]) => setProfile(current => ({ ...current, [key]: value }))
  const selectProvider = (type: ProviderType) => {
    const preset = getProviderPreset(type)
    setProfile(current => ({
      ...current,
      type,
      name: preset.label,
      baseUrl: preset.baseUrl,
      model: preset.model,
      temperature: preset.temperature,
    }))
    setTestMessage('')
  }

  const persistProfile = async (secret?: string, approval?: ApprovalRequest) => {
    setSaving(true)
    try {
      const saved = await desktop.settings.saveAI(profile, secret || undefined)
      let nextApprovals = useWorkspace.getState().approvals
      if (approval) {
        const applied = await desktop.approvals.decide(approval.id, 'applied')
        nextApprovals = nextApprovals.map(item => item.id === approval.id ? applied : item)
      }
      const currentProfiles = useWorkspace.getState().aiProfiles
      setProfile(saved)
      setApiKey('')
      set({
        aiProfiles: [saved, ...currentProfiles.filter(item => item.id !== saved.id)],
        approvals: nextApprovals,
        notice: secret ? 'AI profile and encrypted credential saved.' : 'AI profile saved.',
      })
    }
    catch (error) {
      set({ notice: error instanceof Error ? error.message : String(error) })
    }
    finally {
      setSaving(false)
    }
  }

  const saveProfile = async () => {
    if (apiKey) {
      if (secretApproval?.status === 'approved') {
        await persistProfile(apiKey, secretApproval)
        return
      }
      if (secretApproval?.status === 'pending') {
        set({ notice: 'Approve the encrypted credential save in the panel below.' })
        return
      }
      const approval = await desktop.approvals.create({
        projectId: useWorkspace.getState().project?.id,
        action: 'save-secret',
        title: secretApprovalTitle,
        summary: 'The API key will be encrypted by Electron safeStorage using the operating-system credential protection service.',
        risk: 'medium',
      })
      set({
        approvals: [approval, ...useWorkspace.getState().approvals],
        notice: 'Review and approve the encrypted credential save below.',
      })
      return
    }
    await persistProfile()
  }

  const approveAndSave = async (request: ApprovalRequest) => {
    const approved = await desktop.approvals.decide(request.id, 'approved')
    set({ approvals: useWorkspace.getState().approvals.map(item => item.id === request.id ? approved : item) })
    await persistProfile(apiKey, approved)
  }

  const runConnectionTest = async (approval?: ApprovalRequest) => {
    setTesting(true)
    setTestMessage('Testing connection…')
    try {
      const result = await desktop.runtime.testAI(profile.id)
      setTestMessage(result.message)
      if (approval) {
        const updated = await desktop.approvals.decide(approval.id, result.ok ? 'applied' : 'failed')
        set({ approvals: useWorkspace.getState().approvals.map(item => item.id === approval.id ? updated : item) })
      }
    }
    catch (error) {
      setTestMessage(error instanceof Error ? error.message : String(error))
      if (approval) {
        const failed = await desktop.approvals.decide(approval.id, 'failed')
        set({ approvals: useWorkspace.getState().approvals.map(item => item.id === approval.id ? failed : item) })
      }
    }
    finally {
      setTesting(false)
    }
  }

  const testConnection = async () => {
    if (!savedProfile) {
      set({ notice: 'Save this profile before testing its connection.' })
      return
    }
    if (isLocalEndpoint) {
      await runConnectionTest()
      return
    }
    if (testApproval?.status === 'approved') {
      await runConnectionTest(testApproval)
      return
    }
    if (testApproval?.status === 'pending') {
      set({ notice: 'Approve the hosted provider test in the panel below.' })
      return
    }
    const request = await desktop.approvals.create({
      projectId: useWorkspace.getState().project?.id,
      action: 'external-ai',
      title: testApprovalTitle,
      summary: 'Send a fixed, non-project test prompt ("Reply with exactly: OK") to this provider.',
      risk: 'medium',
    })
    set({
      approvals: [request, ...useWorkspace.getState().approvals],
      notice: 'Review and approve the hosted provider test below.',
    })
  }

  const approveAndTest = async (request: ApprovalRequest) => {
    const approved = await desktop.approvals.decide(request.id, 'approved')
    set({ approvals: useWorkspace.getState().approvals.map(item => item.id === request.id ? approved : item) })
    await runConnectionTest(approved)
  }

  const rejectApproval = async (request: ApprovalRequest) => {
    const rejected = await desktop.approvals.decide(request.id, 'rejected')
    set({
      approvals: useWorkspace.getState().approvals.map(item => item.id === request.id ? rejected : item),
      notice: 'Request rejected.',
    })
  }

  const selectSavedProfile = (item: AIProfile) => {
    setProfile(item)
    setApiKey('')
    setTestMessage('')
  }

  return (
    <SettingsShell title="AI provider profiles" subtitle="AI is optional. Provider calls are explicit and consent-gated.">
      <div className="profile-grid">
        <section className="profile-list">
          {aiProfiles.map(item => (
            <button key={item.id} onClick={() => selectSavedProfile(item)}>
              <PlugZap />
              <span>{item.name}<small>{item.type} · {item.model}</small></span>
              {item.hasApiKey && <KeyRound size={13} />}
            </button>
          ))}
          {!aiProfiles.length && <p className="empty-mini">No saved AI profiles.</p>}
        </section>
        <section className="settings-form">
          <div className="field-row">
            <label>Name<input value={profile.name} onChange={event => update('name', event.target.value)} /></label>
            <label>Provider<select data-testid="ai-provider" value={profile.type} onChange={event => selectProvider(event.target.value as ProviderType)}>
              {PROVIDER_PRESETS.map(preset => <option value={preset.type} key={preset.type}>{preset.label}</option>)}
            </select></label>
          </div>
          <label>Base URL<input value={profile.baseUrl} onChange={event => update('baseUrl', event.target.value)} /></label>
          <div className="field-row">
            <label>Model<input value={profile.model} onChange={event => update('model', event.target.value)} /></label>
            <label>API key<input data-testid="ai-api-key" type="password" autoComplete="off" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={profile.hasApiKey ? 'Encrypted key already saved' : 'Never stored in project files'} /></label>
          </div>
          <div className="field-row thirds">
            <label>Temperature<input type="number" min="0" max="2" step=".1" value={profile.temperature} onChange={event => update('temperature', Number(event.target.value))} /></label>
            <label>Max tokens<input type="number" value={profile.maxTokens} onChange={event => update('maxTokens', Number(event.target.value))} /></label>
            <label>Timeout (ms)<input type="number" value={profile.timeout} onChange={event => update('timeout', Number(event.target.value))} /></label>
          </div>
          <p className="security-note"><ShieldCheck /> Credentials are encrypted with the OS protection service and never included in exported DSL, docs, or logs.</p>
          {secretApproval?.status === 'pending' && (
            <div className="inline-approval">
              <div><strong>Save encrypted credential?</strong><span>The API key will be protected by the operating-system credential service.</span></div>
              <div>
                <button className="button danger-ghost tiny" onClick={() => rejectApproval(secretApproval)}>Reject</button>
                <button data-testid="approve-ai-save" className="button accent tiny" disabled={!apiKey || saving} onClick={() => approveAndSave(secretApproval)}>{saving ? 'Saving…' : 'Approve & save'}</button>
              </div>
            </div>
          )}
          {testApproval?.status === 'pending' && (
            <div className="inline-approval">
              <div><strong>Test hosted provider?</strong><span>Only the fixed text “Reply with exactly: OK” will be sent. Project content is excluded.</span></div>
              <div>
                <button className="button danger-ghost tiny" onClick={() => rejectApproval(testApproval)}>Reject</button>
                <button data-testid="approve-ai-test" className="button accent tiny" disabled={testing} onClick={() => approveAndTest(testApproval)}>{testing ? 'Testing…' : 'Approve & test'}</button>
              </div>
            </div>
          )}
          {testMessage && <p className="test-message">{testMessage}</p>}
          <div className="settings-actions">
            <button data-testid="test-ai-profile" className="button ghost" disabled={!savedProfile || testing} title={!savedProfile ? 'Save the profile before testing' : undefined} onClick={testConnection}>
              <PlugZap size={14} /> {testing ? 'Testing…' : isLocalEndpoint ? 'Test local connection' : 'Test connection'}
            </button>
            <button data-testid="save-ai-profile" className="button accent" disabled={saving} onClick={saveProfile}><Save size={14} /> {saving ? 'Saving…' : 'Save profile'}</button>
          </div>
        </section>
      </div>
    </SettingsShell>
  )
}

export function DifySettingsPage() {
  const { difyProfiles, set } = useWorkspace()
  const [profile, setProfile] = useState<DifyProfile>({
    id: crypto.randomUUID(),
    name: 'Local Dify',
    baseUrl: 'http://127.0.0.1/v1',
    timeout: 60000,
    streaming: false,
  })
  const [apiKey, setApiKey] = useState('')
  const [testMessage, setTestMessage] = useState('')
  const update = <K extends keyof DifyProfile>(key: K, value: DifyProfile[K]) => setProfile(current => ({ ...current, [key]: value }))
  const saveProfile = async () => {
    if (apiKey) {
      const approved = useWorkspace.getState().approvals.find(item => item.action === 'save-secret' && item.title.includes(profile.name) && item.status === 'approved')
      if (!approved) {
        const pending = useWorkspace.getState().approvals.find(item => item.action === 'save-secret' && item.title.includes(profile.name) && item.status === 'pending')
        const request = pending ?? await desktop.approvals.create({
          projectId: useWorkspace.getState().project?.id,
          action: 'save-secret',
          title: `Save encrypted Dify credential for ${profile.name}`,
          summary: 'The application API key will be encrypted with the operating-system protection service.',
          risk: 'medium',
        })
        set({
          approvals: pending ? useWorkspace.getState().approvals : [request, ...useWorkspace.getState().approvals],
          approvalPromptId: request.id,
          notice: 'Approve the secret save, then save again.',
        })
        return
      }
    }
    const saved = await desktop.settings.saveDify(profile, apiKey || undefined)
    set({ difyProfiles: [saved, ...difyProfiles.filter(item => item.id !== saved.id)], notice: 'Dify profile saved.' })
    setApiKey('')
  }
  const test = async () => {
    const result = await desktop.runtime.testDify(profile.id)
    setTestMessage(result.message)
  }
  return (
    <SettingsShell title="Dify runtime profiles" subtitle="Editing and simulation do not require a Dify server.">
      <div className="profile-grid">
        <section className="profile-list">
          {difyProfiles.map(item => <button key={item.id} onClick={() => setProfile(item)}><Server /><span>{item.name}<small>{item.baseUrl}</small></span>{item.hasApiKey && <KeyRound size={13} />}</button>)}
          {!difyProfiles.length && <p className="empty-mini">No Dify instances configured.</p>}
        </section>
        <section className="settings-form">
          <div className="field-row">
            <label>Name<input value={profile.name} onChange={event => update('name', event.target.value)} /></label>
            <label>App ID (optional)<input value={profile.appId ?? ''} onChange={event => update('appId', event.target.value)} /></label>
          </div>
          <label>Application API base URL<input value={profile.baseUrl} onChange={event => update('baseUrl', event.target.value)} /></label>
          <label>API key<input type="password" autoComplete="off" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={profile.hasApiKey ? 'Encrypted key already saved' : 'app-…'} /></label>
          <label>Timeout (ms)<input type="number" value={profile.timeout} onChange={event => update('timeout', Number(event.target.value))} /></label>
          {testMessage && <p className="test-message">{testMessage}</p>}
          <div className="settings-actions">
            <button className="button ghost" onClick={test}><PlugZap size={14} /> Test saved profile</button>
            <button className="button accent" onClick={saveProfile}><Save size={14} /> Save profile</button>
          </div>
        </section>
      </div>
    </SettingsShell>
  )
}

function SettingsShell({ title, subtitle, children }: PropsWithChildren<{ title: string; subtitle: string }>) {
  return <div className="page-scroll settings-page"><div className="section-heading"><span className="eyebrow">Local settings</span><h2>{title}</h2><p>{subtitle}</p></div>{children}</div>
}
