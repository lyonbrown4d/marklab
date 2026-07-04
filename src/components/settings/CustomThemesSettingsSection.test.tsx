import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CustomThemesSettingsSection from '@/components/settings/CustomThemesSettingsSection'
import { userThemeApi } from '@/services/userThemeApi'

const preferencesMock = vi.hoisted(() => ({
  state: {
    customThemeId: null as string | null,
    setCustomThemeId: vi.fn(),
  },
}))

const messages: Record<string, string> = {
  'settings.customThemes': 'Custom CSS themes',
  'settings.customThemesDescription': 'Import custom CSS themes.',
  'settings.importTheme': 'Import Theme',
  'settings.openThemesFolder': 'Open Themes Folder',
  'settings.useBuiltInTheme': 'Use Built-in Theme',
  'settings.noCustomThemes': 'No custom themes imported yet.',
  'settings.customThemesDesktopOnly': 'Custom themes are only available in desktop.',
  'settings.customThemesLoadFailed': 'Failed to load custom themes',
  'settings.customThemeImported': 'Custom theme imported',
  'settings.customThemeImportFailed': 'Failed to import custom theme',
  'settings.customThemeRemoved': 'Custom theme removed',
  'settings.customThemeRemoveFailed': 'Failed to remove custom theme',
  'settings.openThemesFolderFailed': 'Failed to open themes folder',
  'settings.removeCustomTheme': 'Remove {{name}}',
}

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('@/services/userThemeApi', () => ({
  userThemeApi: {
    isSupported: vi.fn(),
    list: vi.fn(),
    pickCssFile: vi.fn(),
    importCss: vi.fn(),
    remove: vi.fn(),
    openFolder: vi.fn(),
  },
}))

vi.mock('@/store/usePreferencesStore', () => ({
  usePreferencesStore: (selector: (state: typeof preferencesMock.state) => unknown) =>
    selector(preferencesMock.state),
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, options?: Record<string, string>) => {
      const template = messages[key] ?? key
      return template.replace(/{{(\w+)}}/g, (_, optionKey: string) => options?.[optionKey] ?? '')
    },
  }),
}))

describe('CustomThemesSettingsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    preferencesMock.state.customThemeId = null
    vi.mocked(userThemeApi.isSupported).mockReturnValue(true)
    vi.mocked(userThemeApi.list).mockResolvedValue([])
    vi.mocked(userThemeApi.pickCssFile).mockResolvedValue(null)
    vi.mocked(userThemeApi.importCss).mockResolvedValue({ id: 'ocean', name: 'Ocean' } as never)
    vi.mocked(userThemeApi.remove).mockResolvedValue(undefined)
    vi.mocked(userThemeApi.openFolder).mockResolvedValue(undefined)
  })

  it('shows localized feedback when custom themes fail to load', async () => {
    vi.mocked(userThemeApi.list).mockRejectedValue(new Error('theme store locked'))

    render(<CustomThemesSettingsSection />)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to load custom themes', {
        description: 'Error: theme store locked',
      })
    })
  })

  it('shows localized feedback when importing a theme fails', async () => {
    vi.mocked(userThemeApi.pickCssFile).mockResolvedValue('D:/themes/ocean.css')
    vi.mocked(userThemeApi.importCss).mockRejectedValue(new Error('invalid css'))

    render(<CustomThemesSettingsSection />)

    fireEvent.click(screen.getByRole('button', { name: 'Import Theme' }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to import custom theme', {
        description: 'Error: invalid css',
      })
    })
  })

  it('shows localized feedback when opening the themes folder fails', async () => {
    vi.mocked(userThemeApi.openFolder).mockRejectedValue(new Error('folder missing'))

    render(<CustomThemesSettingsSection />)

    fireEvent.click(screen.getByRole('button', { name: 'Open Themes Folder' }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to open themes folder', {
        description: 'Error: folder missing',
      })
    })
  })

  it('labels custom theme removal and shows localized feedback when removal fails', async () => {
    vi.mocked(userThemeApi.list).mockResolvedValue([{ id: 'ocean', name: 'Ocean' } as never])
    vi.mocked(userThemeApi.remove).mockRejectedValue(new Error('remove denied'))

    render(<CustomThemesSettingsSection />)

    const removeButton = await screen.findByRole('button', { name: 'Remove Ocean' })
    expect(removeButton).toHaveAttribute('title', 'Remove Ocean')

    fireEvent.click(removeButton)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to remove custom theme', {
        description: 'Error: remove denied',
      })
    })
  })

  it('exposes selected custom themes as pressed choices', async () => {
    preferencesMock.state.customThemeId = 'ocean'
    vi.mocked(userThemeApi.list).mockResolvedValue([{ id: 'ocean', name: 'Ocean' } as never])

    render(<CustomThemesSettingsSection />)

    const selectedTheme = await screen.findByRole('button', { name: 'Ocean' })
    expect(selectedTheme).toHaveAttribute('aria-pressed', 'true')
    expect(selectedTheme.closest('.settings-theme-item')).toHaveAttribute('data-selected', 'true')
  })
})
