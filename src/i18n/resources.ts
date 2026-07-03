import enUS from '@/i18n/locales/en-US.json'
import zhCN from '@/i18n/locales/zh-CN.json'

export const supportedLocales = ['zh-CN', 'en-US'] as const
export type Locale = (typeof supportedLocales)[number]

export const defaultLocale: Locale = 'zh-CN'

export const resources = {
  'zh-CN': { translation: zhCN },
  'en-US': { translation: enUS },
} as const

export const normalizeLocale = (input?: string | null): Locale => {
  if (!input) return defaultLocale
  const normalized = input.toLowerCase()
  if (normalized.startsWith('zh')) return 'zh-CN'
  if (normalized.startsWith('en')) return 'en-US'
  return defaultLocale
}
