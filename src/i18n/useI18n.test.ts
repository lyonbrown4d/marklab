import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultLocale, resources, type Locale } from '@/i18n/resources'
import i18n from '@/i18n/setup'
import { useI18n } from '@/i18n/useI18n'

type LocalePreferences = {
  locale: Locale
  setLocale: (locale: Locale) => void
}

const preferences = vi.hoisted(() => ({
  locale: '' as Locale,
  setLocale: vi.fn(),
}))

vi.mock('@/store/usePreferencesStore', () => ({
  usePreferencesStore: <T>(selector: (state: LocalePreferences) => T) => selector(preferences),
}))

const anotherLocale = (): Locale => {
  const locale = (Object.keys(resources) as Locale[]).find((value) => value !== defaultLocale)
  if (!locale) throw new Error('Locale synchronization tests require two supported languages')
  return locale
}

beforeEach(async () => {
  preferences.locale = defaultLocale
  preferences.setLocale.mockClear()
  await i18n.changeLanguage(defaultLocale)
})

describe('useI18n language synchronization', () => {
  it('does not broadcast a language change when a consumer mounts in the current language', () => {
    const changeLanguage = vi.spyOn(i18n, 'changeLanguage')
    const { result } = renderHook(() => useI18n())

    expect(result.current.locale).toBe(defaultLocale)
    expect(changeLanguage).not.toHaveBeenCalled()
  })

  it('preserves existing translation references when modal consumers mount', () => {
    const changeLanguage = vi.spyOn(i18n, 'changeLanguage')
    const existing = renderHook(() => useI18n())
    const translate = existing.result.current.t
    const setLocale = existing.result.current.setLocale

    const modal = renderHook(() => useI18n())
    expect(existing.result.current.t).toBe(translate)
    expect(existing.result.current.setLocale).toBe(setLocale)
    expect(changeLanguage).not.toHaveBeenCalled()
    modal.unmount()
    expect(existing.result.current.t).toBe(translate)
  })

  it('ignores selecting the current language without dropping the preference update', () => {
    const changeLanguage = vi.spyOn(i18n, 'changeLanguage')
    const { result } = renderHook(() => useI18n())

    act(() => result.current.setLocale(defaultLocale))

    expect(preferences.setLocale).toHaveBeenCalledWith(defaultLocale)
    expect(changeLanguage).not.toHaveBeenCalled()
  })

  it('synchronizes an externally changed locale preference', async () => {
    const changeLanguage = vi.spyOn(i18n, 'changeLanguage')
    const { result, rerender } = renderHook(() => useI18n())
    const translate = result.current.t
    const next = anotherLocale()

    preferences.locale = next
    rerender()

    await waitFor(() => expect(i18n.language).toBe(next))
    expect(result.current.t).not.toBe(translate)
    expect(changeLanguage).toHaveBeenCalledExactlyOnceWith(next)
  })

  it('changes language once when the explicit selection reaches the preference effect', async () => {
    const changeLanguage = vi.spyOn(i18n, 'changeLanguage')
    const { result, rerender } = renderHook(() => useI18n())
    const next = anotherLocale()

    await act(async () => {
      result.current.setLocale(next)
    })
    preferences.locale = next
    rerender()

    await waitFor(() => expect(i18n.language).toBe(next))
    expect(preferences.setLocale).toHaveBeenCalledExactlyOnceWith(next)
    expect(changeLanguage).toHaveBeenCalledExactlyOnceWith(next)
  })
})
