import { describe, expect, it } from 'vitest'
import enUS from '@/i18n/locales/en-US.json'
import zhCN from '@/i18n/locales/zh-CN.json'
import { defaultLocale, resources, supportedLocales } from '@/i18n/resources'

const sortedKeys = (value: Record<string, unknown>) => Object.keys(value).sort()

describe('i18n resource boundary', () => {
  it('keeps renderer locale resources structurally aligned', () => {
    expect(sortedKeys(zhCN)).toEqual(sortedKeys(enUS))
  })

  it('keeps supported locales backed by resource bundles', () => {
    expect(supportedLocales).toContain(defaultLocale)
    supportedLocales.forEach((locale) => {
      expect(resources[locale].translation).toBeTruthy()
    })
  })
})
