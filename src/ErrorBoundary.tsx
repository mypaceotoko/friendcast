import { Component, type ReactNode } from 'react'

type ErrorBoundaryProps = { children: ReactNode }
type ErrorBoundaryState = { hasError: boolean }

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, errorInfo: unknown) {
    console.error('App crashed with runtime error', error, errorInfo)
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
