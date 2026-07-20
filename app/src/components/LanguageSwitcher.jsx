import { useTranslation } from 'react-i18next'
import styles from './LanguageSwitcher.module.css'

export function LanguageSwitcher({ light = false }) {
  const { i18n } = useTranslation()
  const current = i18n.language
  const other = current === 'nl' ? 'EN' : 'NL'

  return (
    <button
      onClick={() => i18n.changeLanguage(current === 'nl' ? 'en' : 'nl')}
      className={light ? `${styles.btn} ${styles.btnLight}` : styles.btn}
    >
      {other}
    </button>
  )
}
