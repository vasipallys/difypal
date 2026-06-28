import { AlertCircle, CheckCircle2, Info, ShieldAlert, Sparkles, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { createTwoFilesPatch } from 'diff'
import type { IssueCategory } from '@/shared/types/dsl'
import { useWorkspace } from '@/renderer/stores/workspace'
import { proposeSafeFixes } from '@/core/dsl/fixer'
import { desktop } from '@/renderer/lib/desktop-api'

const categories: Array<IssueCategory | 'all'> = ['all', 'yaml', 'schema', 'graph', 'variable', 'security', 'compatibility', 'prompt']

export function ValidationPage() {
  const { validation, content, project, approvals, set } = useWorkspace()
  const [filter, setFilter] = useState<IssueCategory | 'all'>('all')
  const issues = useMemo(
    () => (validation?.issues ?? []).filter(issue => filter === 'all' || issue.category === filter),
    [filter, validation],
  )
  const errors = validation?.issues.filter(issue => issue.severity === 'error').length ?? 0
  const warnings = validation?.issues.filter(issue => issue.severity === 'warning').length ?? 0
  const proposeFix = async () => {
    try {
      const proposal = proposeSafeFixes(content)
      if (!proposal.changed) {
        set({ notice: 'No conservative structural fixes are available.' })
        return
      }
      const request = await desktop.approvals.create({
        projectId: project?.id,
        action: 'apply-fix',
        title: 'Apply source-derived structural fixes',
        summary: proposal.summary.join(' '),
        risk: 'medium',
        diff: createTwoFilesPatch('before.yml', 'after.yml', content, proposal.content, '', '', { context: 3 }),
      })
      set({
        approvals: [request, ...approvals],
        proposedDsl: proposal.content,
        fixApprovalId: request.id,
        activeTab: 'review',
        notice: 'Review and approve the proposed YAML patch.',
      })
    }
    catch (error) {
      set({ notice: error instanceof Error ? error.message : String(error) })
    }
  }

  return (
    <div className="page-scroll">
      <section className={errors ? 'validation-summary danger' : 'validation-summary success'}>
        {errors ? <ShieldAlert size={30} /> : <CheckCircle2 size={30} />}
        <div>
          <h2>{errors ? 'DSL needs attention before import' : 'All blocking checks pass'}</h2>
          <p>{errors} errors · {warnings} warnings · source profile Dify DSL {validation?.version ?? '0.6.0'}</p>
        </div>
      </section>
      <div className="filter-row">
        {categories.map(category => (
          <button key={category} className={filter === category ? 'chip active' : 'chip'} onClick={() => setFilter(category)}>
            {category}
          </button>
        ))}
        <button className="button tiny" onClick={proposeFix}><Sparkles size={13} /> Propose safe fixes</button>
      </div>
      <section className="issues-list">
        {issues.map(item => (
          <article className={`issue ${item.severity}`} key={item.id}>
            {item.severity === 'error' ? <AlertCircle /> : item.severity === 'warning' ? <TriangleAlert /> : <Info />}
            <div>
              <div className="issue-heading">
                <strong>{item.code}</strong>
                <span>{item.category}</span>
              </div>
              <p>{item.message}</p>
              {item.path && <code>{item.path}</code>}
              {item.suggestion && <small>{item.suggestion}</small>}
            </div>
          </article>
        ))}
        {!issues.length && <div className="empty-state compact"><CheckCircle2 /><h2>No issues in this category</h2></div>}
      </section>
    </div>
  )
}
