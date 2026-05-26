import { Component, type ReactNode } from 'react'

type ErrorBoundaryProps = { children: ReactNode }
type ErrorBoundaryState = {
  hasError: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false
  }

  static getDerivedStateFromError(_error: unknown): Partial<ErrorBoundaryState> {
    return {
      hasError: true
    }
  }

  componentDidCatch(error: unknown, errorInfo: { componentStack?: string }) {
    console.error('App crashed with runtime error', {
      error,
      componentStack: errorInfo?.componentStack ?? ''
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-shell theme-light">
          <main className="screen login-screen">
            <article className="login-card">
              <h1>friendcast</h1>
              <p>エラーが発生しました。再読み込みしてください。</p>
            </article>
          </main>
        </div>
      )
    }
    return this.props.children
  }
}
