import { Bot, FileCheck2, ShieldCheck, X } from 'lucide-react'
import { useState } from 'react'
import type { AIProfile } from '@/shared/types/desktop'

interface Props {
  fileName: string
  aiProfiles: AIProfile[]
  busy: boolean
  onClose: () => void
  onReview: (profileId: string) => void
  onConfigureAI: () => void
}

export function UploadReviewModal({ fileName, aiProfiles, busy, onClose, onReview, onConfigureAI }: Props) {
  const [profileId, setProfileId] = useState(aiProfiles[0]?.id ?? '')

  return (
    <div className="upload-review-backdrop" role="presentation">
      <section className="upload-review-modal" role="dialog" aria-modal="true" aria-labelledby="upload-review-title">
        <header>
          <div>
            <span className="eyebrow"><FileCheck2 size={13} /> DSL uploaded</span>
            <h2 id="upload-review-title">Review this DSL with AI?</h2>
            <p>
              {fileName} has been loaded into the editor. You can run an approval-gated LLM review using
              Parse → Validate → Review → Critique → Suggest → Patch → Revalidate → Report.
            </p>
          </div>
          <button aria-label="Skip AI review" className="icon-button" onClick={onClose}><X size={16} /></button>
        </header>
        <div className="upload-review-body">
          <div className="upload-review-note">
            <ShieldCheck size={15} />
            <span>The LLM review will not change your YAML. It only creates selectable suggestions; changes apply later when you choose them.</span>
          </div>
          {aiProfiles.length
            ? (
                <label>
                  AI profile
                  <select value={profileId} onChange={event => setProfileId(event.target.value)}>
                    {aiProfiles.map(profile => (
                      <option value={profile.id} key={profile.id}>
                        {profile.name} — {profile.model}
                      </option>
                    ))}
                  </select>
                </label>
              )
            : (
                <p className="upload-review-empty">Configure an AI profile before running an LLM review.</p>
              )}
        </div>
        <footer className="approval-actions">
          <button className="button ghost" onClick={onClose}>Skip</button>
          {aiProfiles.length
            ? (
                <button className="button accent" disabled={busy || !profileId} onClick={() => onReview(profileId)}>
                  <Bot size={14} /> {busy ? 'Reviewing…' : 'Review with AI'}
                </button>
              )
            : (
                <button className="button accent" onClick={onConfigureAI}>Configure AI profile</button>
              )}
        </footer>
      </section>
    </div>
  )
}
