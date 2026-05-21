import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { Locale } from '@/i18n/resources'
import i18n from '@/i18n/setup'
import { useAppStore } from '@/store/useAppStore'

export const useI18n = () => {
  const { t } = useTranslation()
  const locale = useAppStore((state) => state.locale)
  const setLocaleStore = useAppStore((state) => state.setLocale)

  useEffect(() => {
    void i18n.changeLanguage(locale)
  }, [locale])

  const setLocale = (next: Locale) => {
    setLocaleStore(next)
    void i18n.changeLanguage(next)
  }

  return { t, locale, setLocale }
}
