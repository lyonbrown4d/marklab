import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AppearanceSettingsPage from '@/components/settings/AppearanceSettingsPage'
import { usePreferencesStore } from '@/store/usePreferencesStore'

const labels: Record<string, string> = {
  'language.en': 'English',
  'language.zh': 'Chinese',
  'menu.language': 'Language',
  'menu.theme': 'Theme',
  'settings.darkTheme': 'Dark theme',
  'settings.languageDescription': 'Choose the interface language.',
  'settings.lightTheme': 'Light theme',
  'settings.systemThemeCurrent': 'Current system appearance: {{mode}}',
  'settings.themeDescription': 'Choose how Marklab follows your operating system.',
  'themeMode.dark': 'Dark Mode',
  'themeMode.light': 'Light Mode',
  'themeMode.system': 'Follow System',
}

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    locale: 'en-US',
    setLocale: vi.fn(),
    t: (key: string, values?: Record<string, string>) =>
      (labels[key] ?? key).replace('{{mode}}', values?.mode ?? ''),
  }),
}))

vi.mock('@/components/settings/CustomThemesSettingsSection', () => ({
  default: () => null,
}))

beforeEach(() => {
  usePreferencesStore.setState(usePreferencesStore.getInitialState(), true)
})

describe('AppearanceSettingsPage', () => {
  it('presents system, light, and dark as one unambiguous three-way choice', async () => {
    render(<AppearanceSettingsPage />)

    const choices = screen.getByRole('radiogroup', { name: 'Theme' })
    expect(choices).toHaveClass('sm:grid-cols-3')
    expect(screen.getByRole('radio', { name: /Follow System/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(
      screen.queryByRole('switch', { name: 'Sync system theme automatically' }),
    ).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: /Dark Mode/ }))
    expect(usePreferencesStore.getState().themeMode).toBe('dark')
  })

  it('announces the resolved system appearance while following the system', () => {
    usePreferencesStore.setState({ themeMode: 'system', theme: 'ink' })
    render(<AppearanceSettingsPage />)

    expect(screen.getByRole('status')).toHaveTextContent('Current system appearance: Dark Mode')
  })
})
