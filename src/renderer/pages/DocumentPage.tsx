import { Download, FileText, RefreshCw } from 'lucide-react'
import { generateDocumentation } from '@/core/docs/generator'
import { generateTestPlan } from '@/core/tests-generator/generator'
import { desktop } from '@/renderer/lib/desktop-api'
import { useWorkspace } from '@/renderer/stores/workspace'

interface Props {
  kind: 'documentation' | 'tests'
}

export function DocumentPage({ kind }: Props) {
  const { parsed, validation, documentation, generatedTests, project, set } = useWorkspace()
  const content = kind === 'documentation' ? documentation : generatedTests
  const regenerate = () => {
    if (!parsed || !validation)
      return set({ notice: 'A valid parsed DSL is required.' })
    set(kind === 'documentation'
      ? { documentation: generateDocumentation(parsed, validation), notice: 'Documentation regenerated.' }
      : { generatedTests: generateTestPlan(parsed), notice: 'Test plan regenerated.' })
  }
  const exportFile = async () => {
    if (!content)
      return set({ notice: 'Generate content first.' })
    const path = await desktop.files.exportText(content, `${project?.name ?? 'dify-workflow'}-${kind}`, 'md')
    if (path)
      set({ notice: `Exported to ${path}` })
  }
  const exportHtml = async () => {
    if (!content)
      return set({ notice: 'Generate content first.' })
    const escaped = content
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${project?.name ?? 'Dify workflow'}</title><style>body{font:16px/1.6 system-ui;max-width:960px;margin:40px auto;padding:0 24px;color:#18212c}pre{white-space:pre-wrap;font:14px/1.6 ui-monospace,monospace}</style></head><body><pre>${escaped}</pre></body></html>`
    const path = await desktop.files.exportText(html, `${project?.name ?? 'dify-workflow'}-${kind}`, 'html')
    if (path)
      set({ notice: `Exported to ${path}` })
  }

  return (
    <div className="document-layout">
      <div className="document-header">
        <div>
          <span className="eyebrow"><FileText size={13} /> Generated artifact</span>
          <h2>{kind === 'documentation' ? 'Workflow documentation' : 'Test case suite'}</h2>
        </div>
        <div>
          <button className="button ghost" onClick={regenerate}><RefreshCw size={14} /> Regenerate</button>
          <button className="button ghost" onClick={exportHtml}><Download size={14} /> HTML</button>
          <button className="button accent" onClick={exportFile}><Download size={14} /> Export Markdown</button>
        </div>
      </div>
      <textarea
        className="markdown-editor"
        value={content}
        onChange={event => set(kind === 'documentation' ? { documentation: event.target.value } : { generatedTests: event.target.value })}
        placeholder={`Generate ${kind} from the current DSL.`}
      />
    </div>
  )
}
