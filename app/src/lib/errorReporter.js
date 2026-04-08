/**
 * Global client-side error reporter.
 * Sends unhandled errors and promise rejections to /api/log/client-error.
 * Call initErrorReporter() once at app startup.
 */

function report(data) {
  try {
    const payload = JSON.stringify({
      ...data,
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    })
    // sendBeacon works even if the page is unloading
    if (!navigator.sendBeacon('/api/log/client-error', new Blob([payload], { type: 'application/json' }))) {
      // Fallback for environments where sendBeacon isn't available
      fetch('/api/log/client-error', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {})
    }
  } catch {
    // Never throw from an error reporter
  }
}

export function initErrorReporter() {
  window.onerror = (message, source, lineno, colno, error) => {
    report({ message: String(message), stack: error?.stack, source: `${source}:${lineno}:${colno}` })
    return false // don't suppress default browser error handling
  }

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason
    report({
      message: reason?.message ?? String(reason),
      stack: reason?.stack,
      source: 'unhandledrejection',
    })
  })
}

// Called by ErrorBoundary on React render errors
export function reportRenderError(error, componentStack) {
  report({
    message: error?.message ?? String(error),
    stack: error?.stack,
    component: componentStack,
    source: 'react_error_boundary',
  })
}
