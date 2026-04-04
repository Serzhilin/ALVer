import { useEffect, useState } from 'react'
import { pollAuthSessionResult } from '../api/client'

/**
 * DeeplinkLogin — landing page for the W3DS wallet mobile auth redirect.
 *
 * The wallet opens the browser here with ?ename=&session=&signature= in the URL.
 * We POST those to /api/auth/login, store the token, and redirect to returnTo.
 * The POST also emits SSE so a waiting desktop browser logs in simultaneously.
 */
export default function DeeplinkLogin() {
  const [error, setError] = useState(null)

  useEffect(() => {
    let ignore = false

    function readParams() {
      // The W3DS wallet may put params in query string OR in the hash (device/version dependent)
      let searchString = window.location.search
      if (!searchString || searchString === '') {
        const hash = window.location.hash
        if (hash && hash.includes('?')) {
          searchString = hash.substring(hash.indexOf('?'))
        } else {
          try { searchString = new URL(window.location.href).search } catch {}
        }
      }
      const p = new URLSearchParams(searchString)
      return {
        ename: p.get('ename'),
        session: p.get('session'),
        signature: p.get('signature'),
        appVersion: p.get('appVersion'),
      }
    }

    async function run() {
      let { ename, session, signature, appVersion } = readParams()

      // Some mobile browsers/wallet versions don't have the URL fully settled on first load
      if (!ename || !session || !signature) {
        await new Promise(r => setTimeout(r, 500))
        if (ignore) return
        ;({ ename, session, signature, appVersion } = readParams())
      }

      if (!ename || !session || !signature) {
        // Already logged in (SSE or background polling stored the token)
        if (localStorage.getItem('alver_token')) {
          window.location.href = '/'
          return
        }
        // Tab killed while in wallet — poll with stored sessionId
        const storedSession = localStorage.getItem('alver_auth_session')
        if (storedSession) {
          localStorage.removeItem('alver_auth_session')
          let attempts = 0
          const poll = setInterval(() => {
            attempts++
            pollAuthSessionResult(storedSession).then(data => {
              if (data?.token) {
                clearInterval(poll)
                if (!ignore) { localStorage.setItem('alver_token', data.token); window.location.href = '/' }
              } else if (attempts >= 10) {
                clearInterval(poll)
                if (!ignore) setError('Authentication timed out. Please try again.')
              }
            }).catch(() => { clearInterval(poll); if (!ignore) setError('Authentication failed.') })
          }, 1000)
          return
        }
        if (!ignore) setError('Missing authentication parameters.')
        return
      }

      window.history.replaceState({}, '', '/deeplink-login')
      localStorage.removeItem('alver_auth_session')

      fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ename, session, signature, appVersion: appVersion || '0.4.0' }),
      })
        .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e)))
        .then(({ token, returnTo }) => {
          if (ignore) return
          localStorage.setItem('alver_token', token)
          window.location.href = returnTo || '/'
        })
        .catch(err => {
          if (!ignore) setError(err?.error || 'Authentication failed.')
        })
    }

    run()
    return () => { ignore = true }
  }, [])

  if (error) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, fontFamily: 'Inter, sans-serif' }}>
        <p style={{ color: '#e53e3e' }}>{error}</p>
        <a href="/" style={{ color: '#2563EB' }}>Back to home</a>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', color: '#555' }}>
      Authenticating…
    </div>
  )
}
