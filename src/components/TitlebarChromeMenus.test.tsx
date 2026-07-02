import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TitlebarLanguageMenu from '@/components/TitlebarLanguageMenu'
import TitlebarThemeMenu from '@/components/TitlebarThemeMenu'

const i18nMock = vi.hoisted(() => ({
  locale: 'en-US',
  setLocale: vi.fn(),
  t: (key: string) => {
    const labels: Record<string, string> = {
      'actions.about': 'About',
      'language.en': 'English',
      'language.zh': 'Chinese',
      'menu.language': 'Language',
      'menu.theme': 'Theme',
      'settings.themePreset': 'Theme preset',
      'theme.github': 'GitHub',
      'theme.graphite': 'Graphite',
      'theme.ink': 'Ink',
      'theme.ivory': 'Ivory',
      'theme.mist': 'Mist',
      'theme.nord': 'Nord',
      'theme.obsidian': 'Obsidian',
      'theme.paper': 'Paper',
      'theme.sepia': 'Sepia',
      'theme.solarized': 'Solarized',
      'themeMode.dark': 'Dark',
      'themeMode.light': 'Light',
      'themeMode.system': 'System',
    }

    return labels[key] ?? key
  },
}))

const preferencesMock = vi.hoisted(() => ({
  setThemeMode: vi.fn(),
  themeMode: 'system',
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => i18nMock,
}))

vi.mock('@/store/usePreferencesStore', () => ({
  usePreferencesStore: (selector: (state: typeof preferencesMock) => unknown) =>
    selector(preferencesMock),
}))

beforeEach(() => {
  i18nMock.locale = 'en-US'
  i18nMock.setLocale.mockClear()
  preferencesMock.themeMode = 'system'
  preferencesMock.setThemeMode.mockClear()
})

describe('Titlebar chrome menus', () => {
  it('labels the theme trigger with the current mode and preset', () => {
    render(<TitlebarThemeMenu theme="paper" setTheme={vi.fn()} onAbout={vi.fn()} />)

    const trigger = screen.getByRole('button', { name: 'Theme - System, Paper' })

    expect(trigger).toHaveAttribute('type', 'button')
    expect(trigger).toHaveAttribute('title', 'Theme - System, Paper')
  })

  it('supports keyboard-menu theme mode, preset, and about actions', async () => {
    const setTheme = vi.fn()
    const onAbout = vi.fn()

    render(<TitlebarThemeMenu theme="paper" setTheme={setTheme} onAbout={onAbout} />)

    const trigger = screen.getByRole('button', { name: 'Theme - System, Paper' })

    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Dark' }))

    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Ink' }))

    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'About' }))

    await waitFor(() => {
      expect(preferencesMock.setThemeMode).toHaveBeenCalledWith('dark')
      expect(setTheme).toHaveBeenCalledWith('ink')
      expect(onAbout).toHaveBeenCalledTimes(1)
    })
  })

  it('labels the language trigger with the current locale and changes locale from the menu', async () => {
    render(<TitlebarLanguageMenu />)

    const trigger = screen.getByRole('button', { name: 'Language - English' })

    expect(trigger).toHaveAttribute('type', 'button')
    expect(trigger).toHaveAttribute('title', 'Language - English')

    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Chinese' }))

    await waitFor(() => {
      expect(i18nMock.setLocale).toHaveBeenCalledWith('zh-CN')
    })
  })

  it('reflects the localized language state in the trigger label', () => {
    i18nMock.locale = 'zh-CN'

    render(<TitlebarLanguageMenu />)

    expect(screen.getByRole('button', { name: 'Language - Chinese' })).toHaveAttribute(
      'title',
      'Language - Chinese',
    )
  })
})
