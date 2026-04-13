import { Navigate } from 'react-router-dom'
import { useUser } from '../context/UserContext'
import { useTranslation } from 'react-i18next'
import LoginScreen from '../components/LoginScreen'

export default function FacilitatorLogin() {
  const { isFacilitator, loginAsFacilitator } = useUser()
  const { t } = useTranslation()

  // Already logged in as facilitator — go straight to dashboard
  if (isFacilitator) return <Navigate to="/" replace />

  function handleLogin(token) {
    // resolveSession (called inside loginAsFacilitator) will fetch communities,
    // set isFacilitator per the selected community, and show the picker if needed.
    loginAsFacilitator(token)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 420, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 32 }}>
          <img src="/logo.png" alt="ALVer" style={{ height: 40, objectFit: 'contain' }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
            <h1 style={{ fontSize: '1.3rem', margin: 0, fontFamily: 'var(--font-title)', lineHeight: 1 }}>ALVer: Facilitator</h1>
            <p style={{ color: 'var(--color-charcoal-light)', margin: 0, fontSize: '0.9rem', lineHeight: 1 }}>{t('home.subtitle')}</p>
          </div>
        </div>

        <div className="card" style={{ padding: 28 }}>
          <LoginScreen onSuccess={handleLogin} nameOption={false} returnTo="/facilitator" />
        </div>

        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center', gap: 24, fontSize: '0.82rem' }}>
          <a href="/" style={{ color: 'var(--color-terracotta)', textDecoration: 'none', fontWeight: 500 }}>
            {t('home.nav_attendee')} login →
          </a>
        </div>

      </div>
    </div>
  )
}
