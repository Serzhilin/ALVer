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
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>⚙️</div>
          <h1 style={{ margin: '0 0 4px', fontSize: '1.4rem', fontFamily: 'var(--font-title)' }}>{t('admin.title')}</h1>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-charcoal-light)' }}>{t('admin.login_hint')}</p>
        </div>
        <div className="card" style={{ padding: 28 }}>
          <LoginScreen onSuccess={(token) => handleSuccess(token)} />
        </div>
      </div>
    </div>
  )
}
