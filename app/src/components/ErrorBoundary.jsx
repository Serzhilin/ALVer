import { Component } from 'react'
import { reportRenderError } from '../lib/errorReporter'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, message: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message ?? 'Unknown error' }
  }

  componentDidCatch(error, info) {
    reportRenderError(error, info?.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div style={{
        minHeight: '100vh', background: 'var(--color-cream, #faf8f5)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '32px 24px', textAlign: 'center',
      }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 16 }}>⚠️</div>
        <h2 style={{ margin: '0 0 10px', fontSize: '1.1rem', fontWeight: 600, color: '#2c2c2c' }}>
          Something went wrong
        </h2>
        <p style={{ color: '#888', fontSize: '0.88rem', margin: '0 0 24px', maxWidth: 320, lineHeight: 1.5 }}>
          {this.state.message}
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '10px 24px', borderRadius: 8, border: 'none',
            background: 'var(--color-terracotta, #C4622D)', color: 'white',
            fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer',
          }}
        >
          Reload
        </button>
      </div>
    )
  }
}
