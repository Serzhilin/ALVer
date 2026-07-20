import { Component } from 'react'
import { Button } from '@ecommons/ui'
import { reportRenderError } from '../lib/errorReporter'
import styles from './ErrorBoundary.module.css'

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
      <div className={styles.page}>
        <div className={styles.icon}>⚠️</div>
        <h2 className={styles.title}>
          Something went wrong
        </h2>
        <p className={styles.message}>
          {this.state.message}
        </p>
        <Button variant="primary" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    )
  }
}
