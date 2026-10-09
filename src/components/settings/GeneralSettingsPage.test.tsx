import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GeneralSettingsPage from '@/components/settings/GeneralSettingsPage'
import { openDialog } from '@/runtime/dialog'
import { usePreferencesStore } from '@/store/usePreferencesStore'

vi.mock('@/runtime/dialog', () => ({ openDialog: vi.fn() }))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/components/MarkdownDefaultAppPrompt', () => ({ default: () => null }))

describe('GeneralSettingsPage terminal shell', () => {
  beforeEach(() => {
    vi.mocked(openDialog).mockReset()
    usePreferencesStore.setState(usePreferencesStore.getInitialState(), true)
  })

  it('selects an executable and restores automatic shell selection', async () => {
    vi.mocked(openDialog).mockResolvedValue('C:\\Program Files\\PowerShell\\7\\pwsh.exe')
    const user = userEvent.setup()
    render(<GeneralSettingsPage />)

    expect(screen.getByDisplayValue('settings.terminalShellAutomatic')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'settings.terminalShellChoose' }))

    expect(openDialog).toHaveBeenCalledWith({
      file: true,
      multiple: false,
      title: 'settings.terminalShellDialogTitle',
    })
    expect(usePreferencesStore.getState().terminalShellPath).toBe(
      'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
    )

    await user.click(screen.getByRole('button', { name: 'settings.terminalShellReset' }))
    expect(usePreferencesStore.getState().terminalShellPath).toBeNull()
  })

  it('configures desktop notification policy and categories', async () => {
    const user = userEvent.setup()
    render(<GeneralSettingsPage />)

    const master = screen.getByRole('switch', { name: 'settings.desktopNotifications' })
    const backgroundOnly = screen.getByRole('switch', {
      name: 'settings.desktopNotificationsBackgroundOnly',
    })
    const exports = screen.getByRole('switch', {
      name: 'settings.desktopNotificationExports',
    })
    const sync = screen.getByRole('switch', { name: 'settings.desktopNotificationSync' })
    const updates = screen.getByRole('switch', { name: 'settings.desktopNotificationUpdates' })

    expect(master).toBeChecked()
    expect(backgroundOnly).toBeChecked()
    expect(exports).toBeChecked()
    expect(sync).toBeChecked()
    expect(updates).toBeChecked()

    await user.click(master)
    expect(backgroundOnly).toBeDisabled()
    expect(exports).toBeDisabled()
    expect(sync).toBeDisabled()
    expect(updates).toBeDisabled()
    expect(usePreferencesStore.getState().desktopNotificationsEnabled).toBe(false)
  })

  it('prevents duplicate selection and exposes picker errors', async () => {
    let rejectPicker!: (error: Error) => void
    vi.mocked(openDialog).mockReturnValue(
      new Promise((_, reject) => {
        rejectPicker = reject
      }),
    )
    const user = userEvent.setup()
    render(<GeneralSettingsPage />)
    const chooseButton = screen.getByRole('button', { name: 'settings.terminalShellChoose' })

    await user.click(chooseButton)
    expect(chooseButton).toBeDisabled()
    await user.click(chooseButton)
    expect(openDialog).toHaveBeenCalledOnce()

    rejectPicker(new Error('Dialog failed'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Dialog failed')
    expect(chooseButton).toBeEnabled()
  })

  it('ignores a picker result that arrives after unmount', async () => {
    let resolvePicker!: (path: string) => void
    vi.mocked(openDialog).mockReturnValue(
      new Promise((resolve) => {
        resolvePicker = resolve
      }),
    )
    const user = userEvent.setup()
    const view = render(<GeneralSettingsPage />)

    await user.click(screen.getByRole('button', { name: 'settings.terminalShellChoose' }))
    view.unmount()
    resolvePicker('C:\\stale-shell.exe')

    await waitFor(() => {
      expect(usePreferencesStore.getState().terminalShellPath).toBeNull()
    })
  })

  it('accepts the selected shell after Strict Mode replays effects', async () => {
    vi.mocked(openDialog).mockResolvedValue('C:\\strict-shell.exe')
    const user = userEvent.setup()
    render(
      <StrictMode>
        <GeneralSettingsPage />
      </StrictMode>,
    )

    await user.click(screen.getByRole('button', { name: 'settings.terminalShellChoose' }))

    expect(usePreferencesStore.getState().terminalShellPath).toBe('C:\\strict-shell.exe')
  })
})
