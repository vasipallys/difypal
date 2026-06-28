import { KeyRound, PlugZap, Save, Server, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import type { AIProfile, DifyProfile, ProviderType } from '@/shared/types/desktop'
import { getProviderPreset, PROVIDER_PRESETS } from '@/core/ai/presets'
import { desktop } from '@/renderer/lib/desktop-api'
import { useWorkspace } from '@/renderer/stores/workspace'

export function AISettingsPage() {
  const { aiProfiles, set } = useWorkspace()
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
  const saveProfile = async () => {
    if (apiKey) {
      const approved = useWorkspace.getState().approvals.find(item => item.action === 'save-secret' && item.title.includes(profile.name) && item.status === 'approved')
      if (!approved) {
        const approval = await desktop.approvals.create({
          projectId: useWorkspace.getState().project?.id,
          action: 'save-secret',
          title: `Save encrypted credential for ${profile.name}`,
          summary: 'The API key will be encrypted by Electron safeStorage using the operating-system credential protection service.',
          risk: 'medium',
        })
        set({ approvals: [approval, ...useWorkspace.getState().approvals], notice: 'Credential save requires approval. Approve it, then save again with the key.' })
        return
      }
    }
    const saved = await desktop.settings.saveAI(profile, apiKey || undefined)
    set({ aiProfiles: [saved, ...aiProfiles.filter(item => item.id !== saved.id)], notice: 'AI profile saved without changing its credential.' })
    setApiKey('')
  }
  const testConnection = async () => {
    const approved = useWorkspace.getState().approvals.find(item => item.action === 'external-ai' && item.title.includes(profile.name) && item.status === 'approved')
    if (!approved) {
      const request = await desktop.approvals.create({
        projectId: useWorkspace.getState().project?.id,
        action: 'external-ai',
        title: `Test external AI profile: ${profile.name}`,
        summary: 'Send a fixed, non-project test prompt ("Reply with exactly: OK") to this provider.',
        risk: 'medium',
      })
      set({ approvals: [request, ...useWorkspace.getState().approvals], notice: 'Approve the external test call, then click Test connection again.' })
      return
    }
    const result = await desktop.runtime.testAI(profile.id)
    setTestMessage(result.message)
    const updated = await desktop.approvals.decide(approved.id, result.ok ? 'applied' : 'failed')
    set({ approvals: useWorkspace.getState().approvals.map(item => item.id === approved.id ? updated : item) })
  }

  return (
    <SettingsShell title="AI provider profiles" subtitle="AI is optional. Provider calls are explicit and consent-gated.">
      <div className="profile-grid">
        <section className="profile-list">
          {aiProfiles.map(item => <button key={item.id} onClick={() => setProfile(item)}><PlugZap /><span>{item.name}<small>{item.type} · {item.model}</small></span>{item.hasApiKey && <KeyRound size={13} />}</button>)}
          {!aiProfiles.length && <p className="empty-mini">No saved AI profiles.</p>}
        </section>
        <section className="settings-form">
          <div className="field-row">
            <label>Name<input value={profile.name} onChange={event => update('name', event.target.value)} /></label>
            <label>Provider<select value={profile.type} onChange={event => selectProvider(event.target.value as ProviderType)}>
              {PROVIDER_PRESETS.map(preset => <option value={preset.type} key={preset.type}>{preset.label}</option>)}
            </select></label>
          </div>
          <label>Base URL<input value={profile.baseUrl} onChange={event => update('baseUrl', event.target.value)} /></label>
          <div className="field-row">
            <label>Model<input value={profile.model} onChange={event => update('model', event.target.value)} /></label>
            <label>API key<input type="password" autoComplete="off" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={profile.hasApiKey ? 'Encrypted key already saved' : 'Never stored in project files'} /></label>
          </div>
          <div className="field-row thirds">
            <label>Temperature<input type="number" min="0" max="2" step=".1" value={profile.temperature} onChange={event => update('temperature', Number(event.target.value))} /></label>
            <label>Max tokens<input type="number" value={profile.maxTokens} onChange={event => update('maxTokens', Number(event.target.value))} /></label>
            <label>Timeout (ms)<input type="number" value={profile.timeout} onChange={event => update('timeout', Number(event.target.value))} /></label>
          </div>
          <p className="security-note"><ShieldCheck /> Credentials are encrypted with the OS protection service and never included in exported DSL, docs, or logs.</p>
          {testMessage && <p className="test-message">{testMessage}</p>}
          <div className="settings-actions">
            <button className="button ghost" onClick={testConnection}><PlugZap size={14} /> Test connection</button>
            <button className="button accent" onClick={saveProfile}><Save size={14} /> Save profile</button>
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
        const request = await desktop.approvals.create({
          projectId: useWorkspace.getState().project?.id,
          action: 'save-secret',
          title: `Save encrypted Dify credential for ${profile.name}`,
          summary: 'The application API key will be encrypted with the operating-system protection service.',
          risk: 'medium',
        })
        set({ approvals: [request, ...useWorkspace.getState().approvals], notice: 'Approve the secret save in AI Review, then return and save again.' })
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

function SettingsShell({ title, subtitle, children }: React.PropsWithChildren<{ title: string; subtitle: string }>) {
  return <div className="page-scroll settings-page"><div className="section-heading"><span className="eyebrow">Local settings</span><h2>{title}</h2><p>{subtitle}</p></div>{children}</div>
}
