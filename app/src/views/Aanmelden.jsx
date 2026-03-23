import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getAllMeetings } from '../api/client'

/**
 * Fixed public URL: /aanmelden
 * Finds the current announced (open) meeting and redirects to its register page.
 */
export default function Aanmelden() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [status, setStatus] = useState('loading') // loading | redirect | none | closed

  useEffect(() => {
    getAllMeetings()
      .then(meetings => {
        const open = meetings.find(m => m.status === 'open')
        if (open) {
          navigate(`/meeting/${open.id}/register`, { replace: true })
          return
        }
        const active = meetings.find(m => m.status === 'in_session')
        if (active) { setStatus('closed'); return }
        setStatus('none')
      })
      .catch(() => setStatus('none'))
  }, [])

  if (status === 'loading') {
    return <Screen emoji="⏳" message={t('common.loading')} />
  }
  if (status === 'closed') {
    return <Screen emoji="🔒" message={t('aanmelden.closed')} />
  }
  return <Screen emoji="📭" message={t('aanmelden.none')} />
}

function Screen({ emoji, message }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: 16 }}>{emoji}</div>
        <p style={{ color: 'var(--color-charcoal-light)', fontSize: '1rem', margin: 0 }}>{message}</p>
      </div>
    </div>
  )
}
