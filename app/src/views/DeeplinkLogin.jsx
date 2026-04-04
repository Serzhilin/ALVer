import { useEffect, useState } from 'react'

/**
 * DeeplinkLogin — landing page opened by the W3DS wallet after mobile auth.
 * Mirrors the eVoting implementation exactly.
 *
 * The wallet:
 *   1. POSTs ename/session/signature to /api/auth/login  (server-to-server)
 *   2. Opens browser → /deeplink-login?ename=&session=&signature=&appVersion=
 *
 * This page reads the params, POSTs to the API, stores the token, and redirects.
 */
export default function DeeplinkLogin() {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const handleDeeplinkLogin = async () => {
      try {
        // Try query string first; fall back to hash (some wallet versions / devices)
        let searchString = window.location.search
        if (!searchString || searchString === '') {
          const hash = window.location.hash
          if (hash && hash.includes('?')) {
            searchString = hash.substring(hash.indexOf('?'))
          } else {
            try { searchString = new URL(window.location.href).search } catch {}
          }
        }
        if (searchString.startsWith('?')) searchString = searchString.substring(1)

        const params = new URLSearchParams(searchString)
        const ename      = params.get('ename')
        const session    = params.get('session')
        const signature  = params.get('signature')
        const appVersion = params.get('appVersion')

        if (!ename || !session || !signature) {
          setError('Missing required authentication parameters')
          setIsLoading(false)
          return
        }

        // Clean up URL
        window.history.replaceState({}, '', window.location.pathname)

        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ename, session, signature, appVersion: appVersion || '0.4.0' }),
        })

        if (response.ok) {
          const data = await response.json()
          if (data.token && data.user) {
            localStorage.setItem('alver_token', data.token)
            window.location.href = data.returnTo || '/'
          } else {
            setError('Invalid response from server')
            setIsLoading(false)
          }
        } else {
          let errorData
          try { errorData = await response.json() } catch { errorData = { error: `Server error: ${response.status}` } }
          setError(errorData.error || 'Authentication failed')
          setIsLoading(false)
        }
      } catch (err) {
        console.error('DeeplinkLogin failed:', err)
        setError('Failed to connect to server')
        setIsLoading(false)
      }
    }

    handleDeeplinkLogin()
  }, [])

  if (isLoading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', color: '#555' }}>
        Authenticating…
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, fontFamily: 'Inter, sans-serif' }}>
      <p style={{ color: '#e53e3e' }}>{error}</p>
      <a href="/" style={{ color: '#2563EB' }}>Back to home</a>
    </div>
  )
}
