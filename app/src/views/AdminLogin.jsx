import LoginScreen from '../components/LoginScreen'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Page, Card, Heading } from '@ecommons/ui'
import styles from './AdminLogin.module.css'

export default function AdminLogin() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  function handleSuccess(token, _user) {
    localStorage.setItem('alver_token', token)
    navigate('/admin/dashboard', { replace: true })
  }

  return (
    <div className={styles.root}>
      <Page maxWidth={420}>
        <div className={styles.logoRow}>
          <img src="/logo.png" alt="ALVer" className={styles.logo} />
          <div className={styles.logoText}>
            <Heading as="h1" fontSize="1.3rem">ALVer: Admin</Heading>
            <p className={styles.subtitle}>{t('home.subtitle')}</p>
          </div>
        </div>
        <Card style={{ padding: 'var(--space-28)' }}>
          <LoginScreen onSuccess={(token) => handleSuccess(token)} />
        </Card>
        <div className={styles.navLinks}>
          <a href="/" className={styles.navLink}>
            {t('home.nav_attendee')} login →
          </a>
          <a href="/facilitator" className={styles.navLink}>
            {t('home.facilitator_link')}
          </a>
        </div>
      </Page>
    </div>
  )
}
