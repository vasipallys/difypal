import { Check, Clock3, GitCompareArrows, ShieldCheck, X } from 'lucide-react'
import { desktop } from '@/renderer/lib/desktop-api'
import { useWorkspace } from '@/renderer/stores/workspace'

export function ReviewPage() {
  const { approvals, validation, proposedDsl, fixApprovalId, set } = useWorkspace()
  const decide = async (id: string, status: 'approved' | 'rejected') => {
    const updated = await desktop.approvals.decide(id, status)
    set({ approvals: approvals.map(item => item.id === id ? updated : item), notice: `Request ${status}.` })
  }
  const applyFix = async (id: string) => {
    if (!proposedDsl || fixApprovalId !== id)
      return set({ notice: 'The proposed patch is no longer available in this session.' })
    const updated = await desktop.approvals.decide(id, 'applied')
    set({
      content: proposedDsl,
      proposedDsl: undefined,
      fixApprovalId: undefined,
      approvals: approvals.map(item => item.id === id ? updated : item),
      activeTab: 'validation',
      notice: 'Approved YAML patch applied. Validation is running again.',
    })
  }
  return (
    <div className="page-scroll">
      <section className="review-overview">
        <div>
          <span className="eyebrow"><ShieldCheck size={13} /> Human-in-the-loop control</span>
          <h2>Nothing sensitive or destructive crosses this gate silently.</h2>
          <p>External calls, real runs, AI repairs, secret saves, overwrites, and final export require an explicit decision.</p>
        </div>
        <div className="review-score">
          <strong>{validation?.valid ? 'Ready' : 'Review'}</strong>
          <span>{validation?.issues.length ?? 0} findings</span>
        </div>
      </section>
      <section className="approval-list">
        {approvals.map(request => (
          <article className="approval-card" key={request.id}>
            <div className="approval-icon"><GitCompareArrows /></div>
            <div className="approval-body">
              <div className="approval-title">
                <div><h3>{request.title}</h3><span className={`risk ${request.risk}`}>{request.risk} risk</span></div>
                <span className={`approval-status ${request.status}`}><Clock3 size={12} /> {request.status}</span>
              </div>
              <p>{request.summary}</p>
              {request.diff && <pre className="diff-preview">{request.diff}</pre>}
              {request.status === 'pending' && (
                <div className="approval-actions">
                  <button className="button danger-ghost" onClick={() => decide(request.id, 'rejected')}><X size={14} /> Reject</button>
                  <button className="button accent" onClick={() => decide(request.id, 'approved')}><Check size={14} /> Approve</button>
                </div>
              )}
              {request.status === 'approved' && request.action === 'apply-fix' && (
                <div className="approval-actions">
                  <button className="button accent" onClick={() => applyFix(request.id)}><Check size={14} /> Apply approved patch</button>
                </div>
              )}
            </div>
          </article>
        ))}
        {!approvals.length && (
          <div className="empty-state"><ShieldCheck /><h2>Approval queue is clear</h2><p>Requests will appear here before protected actions.</p></div>
        )}
      </section>
    </div>
  )
}
