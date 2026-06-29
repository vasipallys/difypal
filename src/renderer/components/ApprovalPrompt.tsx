import { Check, Clock3, GitCompareArrows, ShieldCheck, X } from 'lucide-react'
import { desktop } from '@/renderer/lib/desktop-api'
import { useWorkspace } from '@/renderer/stores/workspace'

const continueCopy: Record<string, string> = {
  'external-ai': 'Request approved. Continue the action when ready.',
  'dify-run': 'Dify run approved. Run it again when ready.',
  'export-dsl': 'Export approved. Click Export DSL again when ready.',
  'save-secret': 'Secret save approved. Save again when ready.',
  'overwrite-file': 'File overwrite approved. Continue when ready.',
}

export function ApprovalPrompt() {
  const { approvals, approvalPromptId, proposedDsl, fixApprovalId, set } = useWorkspace()
  const request = approvals.find(item => item.id === approvalPromptId && item.status === 'pending')

  if (!request)
    return null

  const isApplicableFix = request.action === 'apply-fix' && fixApprovalId === request.id

  const close = () => set({ approvalPromptId: undefined })

  const reject = async () => {
    const rejected = await desktop.approvals.decide(request.id, 'rejected')
    set({
      approvals: useWorkspace.getState().approvals.map(item => item.id === request.id ? rejected : item),
      approvalPromptId: undefined,
      notice: 'Request rejected.',
    })
  }

  const approve = async () => {
    if (isApplicableFix) {
      if (!proposedDsl) {
        set({
          approvalPromptId: undefined,
          notice: 'The proposed patch is no longer available in this session.',
        })
        return
      }
      await desktop.approvals.decide(request.id, 'approved')
      const applied = await desktop.approvals.decide(request.id, 'applied')
      set({
        content: proposedDsl,
        proposedDsl: undefined,
        fixApprovalId: undefined,
        approvals: useWorkspace.getState().approvals.map(item => item.id === request.id ? applied : item),
        approvalPromptId: undefined,
        notice: 'Approved YAML patch applied. Validation is running again.',
      })
      return
    }

    const approved = await desktop.approvals.decide(request.id, 'approved')
    set({
      approvals: useWorkspace.getState().approvals.map(item => item.id === request.id ? approved : item),
      approvalPromptId: undefined,
      notice: continueCopy[request.action] ?? 'Request approved. Continue when ready.',
    })
  }

  return (
    <div className="approval-prompt-backdrop" role="presentation">
      <section className="approval-prompt" role="dialog" aria-modal="true" aria-labelledby="approval-prompt-title">
        <header>
          <div>
            <span className="eyebrow"><ShieldCheck size={13} /> Approval required</span>
            <h2 id="approval-prompt-title">{request.title}</h2>
          </div>
          <button aria-label="Review later" className="icon-button" onClick={close}><X size={16} /></button>
        </header>
        <div className="approval-prompt-body">
          <div className="approval-prompt-meta">
            <span className={`risk ${request.risk}`}>{request.risk} risk</span>
            <span className={`approval-status ${request.status}`}><Clock3 size={12} /> {request.status}</span>
          </div>
          <p>{request.summary}</p>
          {request.diff && <pre className="diff-preview">{request.diff}</pre>}
          <div className="approval-prompt-note">
            <GitCompareArrows size={14} />
            <span>This prompt stays on top of your current screen, so the data you entered remains in place.</span>
          </div>
        </div>
        <footer className="approval-actions">
          <button className="button ghost" onClick={close}>Review later</button>
          <button className="button danger-ghost" onClick={() => void reject()}><X size={14} /> Reject</button>
          <button className="button accent" onClick={() => void approve()}>
            <Check size={14} /> {isApplicableFix ? 'Approve & apply patch' : 'Approve'}
          </button>
        </footer>
      </section>
    </div>
  )
}
