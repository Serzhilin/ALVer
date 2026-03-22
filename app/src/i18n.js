import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import nl from './locales/nl.json'
import en from './locales/en.json'

i18next
  .use(initReactI18next)
  .init({
    resources: {
      nl: { translation: nl },
      en: { translation: en },
    },
    lng: localStorage.getItem('alver_lang') || 'nl',
    fallbackLng: 'nl',
    interpolation: { escapeValue: false },
  })

i18next.on('languageChanged', (lng) => {
  localStorage.setItem('alver_lang', lng)
})

export default i18next
