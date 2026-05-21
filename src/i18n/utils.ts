import { defaultLocale, normalizeLocale, type Locale } from '@/i18n/resources'

export const getSystemLocale = (): Locale => {
  if (typeof navigator !== 'undefined' && navigator.language) {
    return normalizeLocale(navigator.language)
  }
  return defaultLocale
}

export const getInitialLocale = (): Locale => {
  return getSystemLocale()
}
