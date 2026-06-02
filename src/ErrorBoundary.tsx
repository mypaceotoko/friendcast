import { Component, type ReactNode } from 'react'

type ErrorBoundaryProps = { children: ReactNode }
type ErrorBoundaryState = {
  hasError: boolean
  errorName: string
  errorMessage: string
  componentStack: string
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorName: '',
    errorMessage: '',
    componentStack: ''
  }

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    if (error instanceof Error) {
      return {
        hasError: true,
        errorName: error.name,
        errorMessage: error.message
      }
    }

    return {
      hasError: true,
      errorName: 'UnknownError',
      errorMessage: typeof error === 'string' ? error : 'Unknown error'
    }
  }

  componentDidCatch(error: unknown, errorInfo: { componentStack?: string }) {
    const componentStack = errorInfo?.componentStack ?? ''

    console.error('App crashed with runtime error', {
      error,
      componentStack
    })

    this.setState({
      componentStack
    })
  }

  render() {
    if (this.state.hasError) {
      const debugSummary = [this.state.errorName, this.state.errorMessage].filter(Boolean).join(': ')

      return (
        <div className="app-shell theme-light">
          <main className="screen login-screen">
            <article className="login-card">
              <h1>friendcast</h1>
              <p>エラーが発生しました。再読み込みしてください。</p>
              {debugSummary && <p className="auth-debug-line">{debugSummary}</p>}
              {this.state.componentStack && (
                <details className="login-help">
                  <summary>エラー詳細</summary>
                  <pre className="auth-debug-line">{this.state.componentStack}</pre>
                </details>
              )}
              <button className="soft-action-button login-retry-btn" type="button" onClick={() => window.location.reload()}>
                もう一度読み込む
              </button>
            </article>
          </main>
        </div>
      )
    }
    return this.props.children
  }
}
