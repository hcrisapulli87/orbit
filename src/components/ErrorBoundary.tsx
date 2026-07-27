import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Catches a render-time throw and offers a way out.
 *
 * Orbit has far more computed logic than its sibling apps — recurrence
 * expansion, overlap layout, capacity maths — and it runs as an installed
 * home-screen PWA where there is no address bar to retype and no console to
 * read. An uncaught throw there is a permanent white screen, so this is the
 * difference between "reload" and "delete the app".
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Nowhere to send it — no error service, and a private app. The console is
    // still worth it when the app is open in a desktop browser.
    console.error('[orbit] render failed', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main className="screen screen--center">
        <h1 className="brand">Something broke</h1>
        <p className="muted" style={{ textAlign: 'center', maxWidth: 340 }}>
          Orbit hit an error it couldn’t recover from. Your data is safe — it all lives on the
          server, not in the app.
        </p>
        <p className="error" style={{ textAlign: 'center', fontSize: '0.8rem' }}>
          {this.state.error.message}
        </p>
        <button className="btn btn--primary" onClick={() => window.location.assign('/')}>
          Reload Orbit
        </button>
      </main>
    )
  }
}
