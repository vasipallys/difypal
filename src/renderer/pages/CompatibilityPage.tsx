import { BookOpenCheck, Code2, GitCommitHorizontal, ShieldCheck } from 'lucide-react'
import { OFFICIAL_DIFY_COMMIT, OFFICIAL_DIFY_DSL_VERSION, SUPPORTED_NODE_TYPES } from '@/shared/constants/dify'

export function CompatibilityPage() {
  return (
    <div className="page-scroll compatibility-page">
      <section className="review-overview">
        <div>
          <span className="eyebrow"><GitCommitHorizontal size={13} /> Source-pinned profile</span>
          <h2>Dify compatibility is evidence, not guesswork.</h2>
          <p>This build was derived from the official repository and its pinned Graphon runtime package.</p>
        </div>
        <div className="review-score"><strong>{OFFICIAL_DIFY_DSL_VERSION}</strong><span>current app DSL</span></div>
      </section>
      <div className="compatibility-grid">
        <article className="compat-card">
          <Code2 />
          <h3>Source baseline</h3>
          <p><code>{OFFICIAL_DIFY_COMMIT}</code></p>
          <p>Dify main, inspected June 28, 2026. Runtime node schemas additionally derive from pinned <code>graphon==0.5.3</code>.</p>
        </article>
        <article className="compat-card">
          <BookOpenCheck />
          <h3>Top-level contract</h3>
          <p><code>version</code>, <code>kind: app</code>, and <code>app</code> are required by the Studio. Dify itself defaults a missing version to 0.1.0 and coerces kind to app during import; Studio reports these as errors to keep exports explicit.</p>
        </article>
        <article className="compat-card">
          <ShieldCheck />
          <h3>Version behavior</h3>
          <p>Newer versions and major mismatches require confirmation. Older minor versions import with warnings. Invalid semantic versions fail.</p>
        </article>
      </div>
      <section className="compat-table-card">
        <h3>Application modes</h3>
        <table><thead><tr><th>Mode</th><th>DSL payload</th><th>Local handling</th></tr></thead><tbody>
          <tr><td>workflow</td><td><code>workflow</code></td><td>Validate, visualize, simulate</td></tr>
          <tr><td>advanced-chat</td><td><code>workflow</code></td><td>Validate, visualize, simulate</td></tr>
          <tr><td>completion / chat / agent-chat</td><td><code>model_config</code></td><td>Inspect and validate configuration</td></tr>
          <tr><td>agent</td><td>Separate Agent runtime</td><td>Compatibility warning; AppDslService does not currently import it</td></tr>
          <tr><td>rag-pipeline</td><td>Dedicated DSL service</td><td>Inspect-only in this app profile</td></tr>
        </tbody></table>
      </section>
      <section className="compat-table-card">
        <h3>Source-derived node catalog</h3>
        <div className="node-catalog">{SUPPORTED_NODE_TYPES.map(node => <code key={node}>{node}</code>)}</div>
      </section>
      <section className="compat-table-card prose">
        <h3>Important portability and secret rules</h3>
        <ul>
          <li>Variable selectors are arrays such as <code>[nodeId, outputName]</code>; prompt references use <code>{'{{#nodeId.output#}}'}</code>.</li>
          <li>Environment and conversation variables are lists under <code>workflow</code>. Secret environment values are blanked unless Dify’s secret-inclusive export is explicitly requested.</li>
          <li>Tool and agent credential IDs are stripped from normal export. Webhook URLs and plugin subscription IDs are cleared; schedule config is reset.</li>
          <li>Knowledge dataset IDs can be workspace-encrypted on export and may not resolve in another workspace.</li>
          <li>Dependencies became explicit in newer DSL revisions. Dify derives dependencies from graphs/model config for DSL ≤ 0.1.5.</li>
          <li>The safe simulator never executes code and mocks network, model, agent, retrieval, tool, and datasource nodes.</li>
        </ul>
      </section>
    </div>
  )
}
