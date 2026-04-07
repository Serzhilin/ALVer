import LoginScreen from '../components/LoginScreen'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function AdminLogin() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  function handleSuccess(token, _user) {
    localStorage.setItem('alver_token', token)
    navigate('/admin/dashboard', { replace: true })
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 20px' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 32 }}>
          <img src="/logo.png" alt="ALVer" style={{ height: 40, objectFit: 'contain' }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
            <h1 style={{ fontSize: '1.3rem', margin: 0, fontFamily: 'var(--font-title)', lineHeight: 1 }}>ALVer: Admin</h1>
            <p style={{ color: 'var(--color-charcoal-light)', margin: 0, fontSize: '0.9rem', lineHeight: 1 }}>{t('home.subtitle')}</p>
          </div>
        </div>
        <div className="card" style={{ padding: 28 }}>
          <LoginScreen onSuccess={(token) => handleSuccess(token)} />
        </div>
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center', gap: 24, fontSize: '0.82rem', color: 'var(--color-charcoal-light)' }}>
          <a href="/" style={{ color: 'var(--color-terracotta)', textDecoration: 'none', fontWeight: 500 }}>
            {t('home.nav_attendee')} login →
          </a>
          <a href="/facilitator" style={{ color: 'var(--color-terracotta)', textDecoration: 'none', fontWeight: 500 }}>
            {t('home.facilitator_link')}
          </a>
        </div>
      </div>
    </div>
  )
}
