import { useTranslation } from 'react-i18next'

export function LanguageSwitcher({ light = false }) {
  const { i18n } = useTranslation()
  const current = i18n.language
  const other = current === 'nl' ? 'EN' : 'NL'

  return (
    <button
      onClick={() => i18n.changeLanguage(current === 'nl' ? 'en' : 'nl')}
      style={{
        background: light ? 'rgba(255,255,255,0.15)' : 'var(--color-cream)',
        border: light ? '1px solid rgba(255,255,255,0.25)' : '1px solid var(--color-sand-dark)',
        color: light ? 'white' : 'var(--color-charcoal)',
        borderRadius: 6,
        padding: '4px 10px',
        fontSize: '0.75rem',
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'Inter, sans-serif',
        letterSpacing: '0.04em',
      }}
    >
      {other}
    </button>
  )
}
