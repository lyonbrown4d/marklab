import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { Locale } from '@/i18n/resources'
import i18n from '@/i18n/setup'
import { usePreferencesStore } from '@/store/usePreferencesStore'

export const useI18n = () => {
  const { t } = useTranslation()
  const locale = usePreferencesStore((state) => state.locale)
  const setLocaleStore = usePreferencesStore((state) => state.setLocale)

  useEffect(() => {
    if (i18n.language !== locale) {
      void i18n.changeLanguage(locale)
    }
  }, [locale])

  const setLocale = useCallback(
    (next: Locale) => {
      setLocaleStore(next)
      if (i18n.language !== next) {
        void i18n.changeLanguage(next)
      }
    },
    [setLocaleStore],
  )

  return { t, locale, setLocale }
}
