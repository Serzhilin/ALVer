import { useTranslation } from 'react-i18next'
import { Button } from '@ecommons/ui'

export function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const current = i18n.language
  const other = current === 'nl' ? 'EN' : 'NL'

  return (
    <Button
      variant="secondary"
      onClick={() => i18n.changeLanguage(current === 'nl' ? 'en' : 'nl')}
    >
      {other}
    </Button>
  )
}
