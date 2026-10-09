import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ElectronUpdateEvent, ElectronUpdateState } from '@/runtime/electron'
import SoftwareUpdateSettingsSection from '@/components/settings/SoftwareUpdateSettingsSection'

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string, values?: { version?: string }) => values?.version ?? key }),
}))

const updates = vi.hoisted(() => ({
  check: vi.fn(),
  download: vi.fn(),
  getState: vi.fn(),
  install: vi.fn(),
  onEvent: vi.fn(),
  setInstallOnQuit: vi.fn(),
}))

vi.mock('@/runtime/electron', () => ({
  getElectronRuntime: () => ({ updates }),
  isElectronRuntime: () => true,
}))

const state = (overrides: Partial<ElectronUpdateState> = {}): ElectronUpdateState => ({
  currentVersion: '0.2.4',
  installOnQuit: false,
  status: 'idle',
  ...overrides,
})

let updateHandler: ((event: ElectronUpdateEvent) => void) | undefined

describe('SoftwareUpdateSettingsSection actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateHandler = undefined
    updates.getState.mockResolvedValue(state())
    updates.onEvent.mockImplementation((handler) => {
      updateHandler = handler
      return vi.fn()
    })
    updates.check.mockResolvedValue({ ...state({ status: 'not-available' }), ok: true })
    updates.download.mockResolvedValue({ ...state({ status: 'downloaded' }), ok: true })
    updates.install.mockResolvedValue({ ...state({ status: 'installing' }), ok: true })
    updates.setInstallOnQuit.mockResolvedValue({
      ...state({ installOnQuit: true, status: 'downloaded' }),
      ok: true,
    })
  })

  it('manually checks once while the request is pending', async () => {
    let resolveCheck!: (result: unknown) => void
    updates.check.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCheck = resolve
      }),
    )
    const user = userEvent.setup()
    render(<SoftwareUpdateSettingsSection />)
    const check = await screen.findByRole('button', { name: 'settings.softwareUpdateCheck' })

    await user.click(check)
    await user.click(check)

    expect(updates.check).toHaveBeenCalledOnce()
    expect(check).toBeDisabled()
    act(() => resolveCheck({ ...state(), ok: true }))
  })

  it.each([
    ['check', 'settings.softwareUpdateCheck', state(), updates.check],
    [
      'download',
      'settings.softwareUpdateDownload',
      state({ info: { version: '0.3.0' }, status: 'available' }),
      updates.download,
    ],
    [
      'install',
      'settings.softwareUpdateInstall',
      state({ info: { version: '0.3.0' }, status: 'downloaded' }),
      updates.install,
    ],
  ])('shows a visible %s failure', async (operation, buttonName, initialState, request) => {
    updates.getState.mockResolvedValueOnce(initialState)
    request.mockRejectedValueOnce(new Error(`${operation} failed`))
    const user = userEvent.setup()
    render(<SoftwareUpdateSettingsSection />)

    await user.click(await screen.findByRole('button', { name: buttonName }))

    expect(await screen.findByRole('alert')).toHaveTextContent(`${operation} failed`)
  })

  it('shows release notes as text without creating release-provided markup', async () => {
    updates.getState.mockResolvedValueOnce(
      state({
        info: { releaseNotes: 'Fixed <strong>crashes</strong>', version: '0.3.0' },
        status: 'available',
      }),
    )
    const view = render(<SoftwareUpdateSettingsSection />)

    expect(await screen.findByText('Fixed <strong>crashes</strong>')).toBeInTheDocument()
    expect(view.container.querySelector('strong')).toBeNull()
  })

  it('shows the available version only while an update is actionable', async () => {
    updates.getState.mockResolvedValueOnce(
      state({ info: { version: '0.3.0' }, status: 'not-available' }),
    )
    render(<SoftwareUpdateSettingsSection />)

    await screen.findByText('0.2.4')
    expect(screen.queryByText('0.3.0')).not.toBeInTheDocument()
  })

  it('clears a previous action error when a successful updater event arrives', async () => {
    updates.check.mockRejectedValueOnce(new Error('temporary network failure'))
    const user = userEvent.setup()
    render(<SoftwareUpdateSettingsSection />)
    await user.click(await screen.findByRole('button', { name: 'settings.softwareUpdateCheck' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('temporary network failure')

    act(() => {
      updateHandler?.({
        currentVersion: '0.2.4',
        event: 'not-available',
        installOnQuit: false,
        status: 'not-available',
      })
    })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not allow another check while installation is starting', async () => {
    updates.getState.mockResolvedValueOnce(state({ status: 'installing' }))
    render(<SoftwareUpdateSettingsSection />)

    expect(
      await screen.findByRole('button', { name: 'settings.softwareUpdateCheck' }),
    ).toBeDisabled()
  })

  it('schedules installation on exit and keeps immediate restart available', async () => {
    updates.getState.mockResolvedValueOnce(
      state({ info: { version: '0.3.0' }, status: 'downloaded' }),
    )
    const user = userEvent.setup()
    render(<SoftwareUpdateSettingsSection />)

    await user.click(
      await screen.findByRole('button', { name: 'settings.softwareUpdateInstallOnQuit' }),
    )

    expect(updates.setInstallOnQuit).toHaveBeenCalledWith(true)
    expect(screen.getByText('settings.softwareUpdateInstallOnQuitScheduled')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'settings.softwareUpdateInstall' })).toBeEnabled()
  })
})
