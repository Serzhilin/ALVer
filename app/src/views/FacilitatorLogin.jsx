import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useUser } from '../context/UserContext'
import { useTranslation } from 'react-i18next'
import { getMe } from '../api/client'
import LoginScreen from '../components/LoginScreen'

export default function FacilitatorLogin() {
  const { isFacilitator, loginAsFacilitator } = useUser()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [authError, setAuthError] = useState(false)

  // Already logged in as facilitator — go straight to dashboard
  if (isFacilitator) return <Navigate to="/" replace />

  async function handleLogin(token, user) {
    // Store token temporarily so getMe() can use it
    localStorage.setItem('alver_token', token)
    try {
      const profile = await getMe()
      if (profile.isFacilitator) {
        loginAsFacilitator(token, { ...user, ...profile })
        navigate('/', { replace: true })
      } else {
        localStorage.removeItem('alver_token')
        setAuthError(true)
      }
    } catch {
      localStorage.removeItem('alver_token')
      setAuthError(true)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 420, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>🎙️</div>
          <h1 style={{ fontSize: '1.3rem', margin: '0 0 6px', fontFamily: 'Playfair Display, serif' }}>Facilitator</h1>
          <p style={{ color: 'var(--color-charcoal-light)', fontSize: '0.85rem', margin: 0 }}>
            {t('auth.facilitator_hint')}
          </p>
        </div>

        {authError ? (
          <div className="card" style={{ padding: 28, textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>🚫</div>
            <p style={{ color: 'var(--color-red)', margin: '0 0 20px', fontWeight: 600, fontSize: '0.95rem' }}>
              {t('auth.not_facilitator')}
            </p>
            <button className="btn-secondary" onClick={() => setAuthError(false)}>
              {t('common.back')}
            </button>
          </div>
        ) : (
          <div className="card" style={{ padding: 28 }}>
            <LoginScreen onSuccess={handleLogin} nameOption={false} />
          </div>
        )}

        <button
          onClick={() => navigate('/')}
          style={{ display: 'block', margin: '16px auto 0', background: 'none', border: 'none', color: 'var(--color-charcoal-light)', cursor: 'pointer', fontSize: '0.85rem' }}
        >
          {t('common.back')}
        </button>
      </div>
    </div>
  )
}
