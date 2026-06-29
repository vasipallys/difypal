import { FileCode2, GitBranch, X } from 'lucide-react'
import type { StarterTemplateId } from '@/core/dsl/starter-templates'
import { starterTemplates } from '@/core/dsl/starter-templates'

interface Props {
  onClose: () => void
  onSelect: (id: StarterTemplateId) => void
}

export function BlankDslModal({ onClose, onSelect }: Props) {
  return (
    <div className="blank-dsl-backdrop" role="presentation">
      <section className="blank-dsl-modal" role="dialog" aria-modal="true" aria-labelledby="blank-dsl-title">
        <header>
          <div>
            <span className="eyebrow"><FileCode2 size={13} /> Blank DSL creation</span>
            <h2 id="blank-dsl-title">Choose a deterministic starter pattern</h2>
            <p>These templates are generated locally from the pattern guides. No AI call is made; you get a valid DSL skeleton to edit, validate, and run.</p>
          </div>
          <button aria-label="Close blank DSL templates" className="icon-button" onClick={onClose}><X size={16} /></button>
        </header>
        <div className="starter-template-grid">
          {starterTemplates.map(template => (
            <article className="starter-template-card" key={template.id}>
              <div className="starter-template-head">
                <span>{template.family}</span>
                <h3>{template.title}</h3>
              </div>
              <p>{template.description}</p>
              <div className="starter-flow" aria-label={`${template.title} flow`}>
                <GitBranch size={13} />
                <span>{template.flow.join(' → ')}</span>
              </div>
              <small><b>{template.pattern}</b> · {template.bestFor}</small>
              <button
                data-testid={`blank-template-${template.id}`}
                className="button accent"
                onClick={() => onSelect(template.id)}
              >
                Use this template
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
