import { Check, Clock3, GitCompareArrows, ShieldCheck, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { applyReviewChanges } from '@/core/agents/dsl-review'
import { generateDocumentation } from '@/core/docs/generator'
import { generateTestPlan } from '@/core/tests-generator/generator'
import { desktop } from '@/renderer/lib/desktop-api'
import { useWorkspace } from '@/renderer/stores/workspace'

export function ReviewPage() {
  const { approvals, validation, proposedDsl, fixApprovalId, aiDslReview, content, set } = useWorkspace()
  const [selectedChangeIds, setSelectedChangeIds] = useState<string[]>([])
  const patchableChanges = useMemo(
    () => aiDslReview?.recommendedChanges.filter(change => change.jsonPatch.length > 0) ?? [],
    [aiDslReview],
  )

  useEffect(() => {
    setSelectedChangeIds(patchableChanges.map(change => change.id))
  }, [patchableChanges])

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
  const toggleChange = (id: string) => {
    setSelectedChangeIds(current =>
      current.includes(id)
        ? current.filter(item => item !== id)
        : [...current, id],
    )
  }
  const applySelectedAiChanges = () => {
    if (!aiDslReview)
      return
    const changes = aiDslReview.recommendedChanges.filter(change =>
      selectedChangeIds.includes(change.id) && change.jsonPatch.length > 0,
    )
    if (!changes.length) {
      set({ notice: 'Select at least one patchable AI suggestion first.' })
      return
    }
    try {
      const result = applyReviewChanges(content, changes)
      set({
        content: result.dsl,
        parsed: result.document,
        validation: result.validation,
        documentation: generateDocumentation(result.document, result.validation),
        generatedTests: generateTestPlan(result.document),
        notice: `Applied ${changes.length} AI suggestion(s) and revalidated the DSL.`,
      })
    }
    catch (error) {
      set({ notice: error instanceof Error ? error.message : String(error) })
    }
  }
  return (
    <div className="page-scroll">
      {aiDslReview && (
        <section className="ai-dsl-review">
          <div className="review-overview ai-review-overview">
            <div>
              <span className="eyebrow"><ShieldCheck size={13} /> AI DSL review report</span>
              <h2>Parse → Validate → Review → Critique → Suggest → Patch → Revalidate → Report</h2>
              <p>Reviewed with {aiDslReview.model} on {new Date(aiDslReview.reviewedAt).toLocaleString()}.</p>
            </div>
            <div className="review-score">
              <strong>{aiDslReview.dslValidity.status === 'valid' ? 'Valid' : 'Invalid'}</strong>
              <span>{aiDslReview.recommendedChanges.length} suggestions</span>
            </div>
          </div>

          <section className="ai-review-section">
            <h3>1. Executive Summary</h3>
            <p>{aiDslReview.executiveSummary}</p>
          </section>

          <section className="ai-review-section">
            <h3>2. DSL Valid / Invalid</h3>
            <p><span className={`approval-status ${aiDslReview.dslValidity.status === 'valid' ? 'approved' : 'failed'}`}>{aiDslReview.dslValidity.status}</span> {aiDslReview.dslValidity.reason}</p>
          </section>

          <ListSection title="3. Critical Issues" items={aiDslReview.criticalIssues} empty="No critical issues reported." />

          <section className="ai-review-section">
            <h3>4. Node-by-Node Review</h3>
            {aiDslReview.nodeByNodeReview.length
              ? aiDslReview.nodeByNodeReview.map((node, index) => (
                  <article className={`node-review ${node.status}`} key={`${node.nodeId ?? index}:${node.finding}`}>
                    <div>
                      <strong>{node.nodeTitle ?? node.nodeId ?? `Node ${index + 1}`}</strong>
                      {node.nodeType && <code>{node.nodeType}</code>}
                      <span>{node.status}</span>
                    </div>
                    <p>{node.finding}</p>
                    <small>{node.recommendation}</small>
                  </article>
                ))
              : <p>No node-level findings reported.</p>}
          </section>

          <ListSection title="5. Prompt Improvements" items={aiDslReview.promptImprovements} empty="No prompt improvements reported." />
          <ListSection title="6. Graph/Edge Issues" items={aiDslReview.graphEdgeIssues} empty="No graph or edge issues reported." />
          <ListSection title="7. Security Risks" items={aiDslReview.securityRisks} empty="No security risks reported." />
          <ListSection title="8. Cost Optimization Suggestions" items={aiDslReview.costOptimizationSuggestions} empty="No cost optimizations reported." />

          <section className="ai-review-section">
            <div className="ai-review-section-title">
              <h3>9. Recommended Code/YAML Changes</h3>
              <div>
                <button className="button tiny" onClick={() => setSelectedChangeIds(patchableChanges.map(change => change.id))}>Select patchable</button>
                <button className="button accent tiny" onClick={applySelectedAiChanges}>Apply selected</button>
              </div>
            </div>
            {aiDslReview.recommendedChanges.length
              ? aiDslReview.recommendedChanges.map(change => (
                  <article className="ai-change-card" key={change.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedChangeIds.includes(change.id)}
                        disabled={!change.jsonPatch.length}
                        onChange={() => toggleChange(change.id)}
                      />
                      <span>
                        <strong>{change.title}</strong>
                        <small>{change.category} · {change.risk} risk · {change.jsonPatch.length ? `${change.jsonPatch.length} patch op(s)` : 'manual change'}</small>
                      </span>
                    </label>
                    <p>{change.rationale}</p>
                    {change.yamlSnippet && <pre className="diff-preview">{change.yamlSnippet}</pre>}
                  </article>
                ))
              : <p>No recommended YAML changes reported.</p>}
          </section>

          <ListSection title="10. Test Cases" items={aiDslReview.testCases} empty="No test cases reported." />

          <section className="ai-review-section">
            <h3>11. Final Improved DSL Snippets</h3>
            {aiDslReview.finalImprovedDslSnippets.length
              ? aiDslReview.finalImprovedDslSnippets.map((snippet, index) => <pre className="diff-preview" key={index}>{snippet}</pre>)
              : <p>No final DSL snippets reported.</p>}
          </section>
        </section>
      )}

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

function ListSection({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <section className="ai-review-section">
      <h3>{title}</h3>
      {items.length
        ? <ul>{items.map(item => <li key={item}>{item}</li>)}</ul>
        : <p>{empty}</p>}
    </section>
  )
}
