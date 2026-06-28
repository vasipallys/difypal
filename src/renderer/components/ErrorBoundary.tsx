import React from 'react'

interface State {
  error?: Error
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = {}

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <main className="fatal-error">
          <div className="fatal-card">
            <span className="eyebrow">Renderer failure</span>
            <h1>The Studio hit an unexpected error.</h1>
            <pre>{this.state.error.message}</pre>
            <button onClick={() => location.reload()}>Reload workspace</button>
          </div>
        </main>
      )
    }
    return this.props.children
  }
}
