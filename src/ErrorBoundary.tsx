import { Component, type ReactNode } from 'react'

type ErrorBoundaryProps = { children: ReactNode }
type ErrorBoundaryState = {
  hasError: boolean
  errorName: string
  errorMessage: string
  componentStack: string
}

const MAX_STACK_LINES = 6

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
      const stackLines = this.state.componentStack.split('\n').filter(Boolean)
      const shortComponentStack = stackLines.slice(0, MAX_STACK_LINES).join('\n')
      const debugDetails = [
        'エラー詳細:',
        this.state.errorName || 'UnknownError',
        this.state.errorMessage || 'Unknown error',
        '',
        'Component stack:',
        shortComponentStack || '(component stack is empty)'
      ].join('\n')

      return (
        <div className="app-shell theme-light">
          <main className="screen login-screen">
            <article className="login-card">
              <h1>friendcast</h1>
              <p>エラーが発生しました。再読み込みしてください。</p>
              <p style={{ fontSize: '0.75rem', marginTop: '1rem', marginBottom: '0.5rem' }}>
                Debug details (temporary)
              </p>
              <pre
                style={{
                  width: '100%',
                  maxHeight: '160px',
                  overflow: 'auto',
                  textAlign: 'left',
                  fontSize: '0.7rem',
                  lineHeight: 1.4,
                  margin: 0,
                  padding: '0.75rem',
                  borderRadius: '8px',
                  backgroundColor: '#f6f6f7',
                  color: '#27272a'
                }}
              >
                {debugDetails}
              </pre>
            </article>
          </main>
        </div>
      )
    }
    return this.props.children
  }
}
