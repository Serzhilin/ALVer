import { Navigate } from 'react-router-dom'
import { useUser } from '../context/UserContext'
import { useTranslation } from 'react-i18next'
import LoginScreen from '../components/LoginScreen'
import { Page, Card, Heading } from '@ecommons/ui'
import styles from './FacilitatorLogin.module.css'

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
    <div className={styles.root}>
      <Page maxWidth={420}>
        <div className={styles.logoRow}>
          <img src="/logo.png" alt="ALVer" className={styles.logo} />
          <div className={styles.logoText}>
            <Heading as="h1" fontSize="1.3rem">ALVer: Facilitator</Heading>
            <p className={styles.subtitle}>{t('home.subtitle')}</p>
          </div>
        </div>
        <Card style={{ padding: 'var(--space-28)' }}>
          <LoginScreen onSuccess={handleLogin} nameOption={false} returnTo="/facilitator" />
        </Card>
        <div className={styles.navLinks}>
          <a href="/" className={styles.navLink}>
            {t('home.nav_attendee')} login →
          </a>
        </div>
      </Page>
    </div>
  )
}
