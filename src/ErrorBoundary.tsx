import { Component, type ReactNode } from 'react'

type ErrorBoundaryProps = { children: ReactNode }
type ErrorBoundaryState = {
  hasError: boolean
  errorMessage: string
  errorStackHead: string
  componentStackHead: string
}

const sanitizeDebugText = (input: string) => {
  return input
    .replace(/(access[_-]?token|refresh[_-]?token|id[_-]?token)\s*[:=]\s*[^\s,]+/gi, '$1=[redacted]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+/g, '[jwt-redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email-redacted]')
}

const headLines = (text: string, maxLines = 4) => text.split('\n').slice(0, maxLines).join('\n')

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
    errorStackHead: '',
    componentStackHead: ''
  }

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : 'Unknown runtime error'
    }
  }

  componentDidCatch(error: unknown, errorInfo: { componentStack?: string }) {
    console.error('App crashed with runtime error', error, errorInfo)
    const errorStack = error instanceof Error && error.stack ? headLines(sanitizeDebugText(error.stack)) : ''
    const componentStack = errorInfo?.componentStack ? headLines(sanitizeDebugText(errorInfo.componentStack)) : ''
    this.setState({ errorStackHead: errorStack, componentStackHead: componentStack })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-shell theme-light">
          <main className="screen login-screen">
            <article className="login-card">
              <h1>friendcast</h1>
              <p>エラーが発生しました。再読み込みしてください。</p>
              <small className="auth-debug-line">error.message: {this.state.errorMessage || '(empty)'}</small>
              <small className="auth-debug-line">error.stack(head): {this.state.errorStackHead || '(none)'}</small>
              <small className="auth-debug-line">componentStack(head): {this.state.componentStackHead || '(none)'}</small>
              <small className="build-marker">v0.5.9-d / PR45 / 063ae894</small>
            </article>
          </main>
        </div>
      )
    }
    return this.props.children
  }
}
