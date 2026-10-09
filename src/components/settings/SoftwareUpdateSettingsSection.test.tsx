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

let updateHandler: ((event: ElectronUpdateEvent) => void) | undefined
const unsubscribe = vi.fn()

const idleState = (): ElectronUpdateState => ({
  currentVersion: '0.2.4',
  installOnQuit: false,
  status: 'idle',
})

describe('SoftwareUpdateSettingsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateHandler = undefined
    updates.getState.mockResolvedValue(idleState())
    updates.check.mockResolvedValue({ ...idleState(), ok: true })
    updates.download.mockResolvedValue({ ...idleState(), ok: true })
    updates.install.mockResolvedValue({ ...idleState(), ok: true })
    updates.setInstallOnQuit.mockResolvedValue({ ...idleState(), ok: true })
    updates.onEvent.mockImplementation((handler) => {
      updateHandler = handler
      return unsubscribe
    })
  })

  it('shows loading, current version, and every service status', async () => {
    let resolveState!: (state: ElectronUpdateState) => void
    updates.getState.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveState = resolve
      }),
    )
    render(<SoftwareUpdateSettingsSection />)
    expect(screen.getByText('settings.softwareUpdateLoading')).toBeInTheDocument()

    resolveState(idleState())
    expect(await screen.findByText('0.2.4')).toBeInTheDocument()
    expect(screen.getByText('settings.softwareUpdateStatus.idle')).toBeInTheDocument()

    for (const status of [
      'checking',
      'not-available',
      'available',
      'downloading',
      'downloaded',
      'error',
      'unavailable',
    ] as const) {
      act(() => {
        updateHandler?.({
          currentVersion: '0.2.4',
          installOnQuit: false,
          event: status === 'downloading' ? 'download-progress' : status,
          error:
            status === 'error' || status === 'unavailable'
              ? { code: 'CHECK_FAILED', message: 'offline', operation: 'check' }
              : undefined,
          info:
            status === 'available' || status === 'downloaded' ? { version: '0.3.0' } : undefined,
          progress:
            status === 'downloading'
              ? { bytesPerSecond: 1, percent: 42, total: 100, transferred: 42 }
              : undefined,
          status,
        })
      })
      expect(screen.getByText(`settings.softwareUpdateStatus.${status}`)).toBeInTheDocument()
    }
  })

  it('downloads an available update once and renders progress', async () => {
    let resolveDownload!: (result: unknown) => void
    updates.download.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDownload = resolve
      }),
    )
    const user = userEvent.setup()
    render(<SoftwareUpdateSettingsSection />)
    await screen.findByText('0.2.4')
    act(() => {
      updateHandler?.({
        currentVersion: '0.2.4',
        installOnQuit: false,
        event: 'available',
        info: { version: '0.3.0' },
        status: 'available',
      })
    })

    const download = screen.getByRole('button', { name: 'settings.softwareUpdateDownload' })
    await user.click(download)
    await user.click(download)
    expect(updates.download).toHaveBeenCalledOnce()
    expect(download).toBeDisabled()

    act(() => {
      updateHandler?.({
        currentVersion: '0.2.4',
        installOnQuit: false,
        event: 'download-progress',
        info: { version: '0.3.0' },
        progress: { bytesPerSecond: 1, percent: 42, total: 100, transferred: 42 },
        status: 'downloading',
      })
    })
    expect(
      screen.getByRole('progressbar', { name: 'settings.softwareUpdateProgress' }),
    ).toHaveAttribute('aria-valuenow', '42')
    resolveDownload({ currentVersion: '0.2.4', ok: true, status: 'downloading' })
  })

  it('keeps immediate restart available for a downloaded update', async () => {
    const user = userEvent.setup()
    render(<SoftwareUpdateSettingsSection />)
    await screen.findByText('0.2.4')
    act(() => {
      updateHandler?.({
        currentVersion: '0.2.4',
        installOnQuit: false,
        event: 'downloaded',
        info: { version: '0.3.0' },
        status: 'downloaded',
      })
    })

    await user.click(screen.getByRole('button', { name: 'settings.softwareUpdateInstall' }))
    expect(updates.install).toHaveBeenCalledOnce()
  })

  it('shows initialization and operation errors and cleans the subscription', async () => {
    updates.getState.mockRejectedValueOnce(new Error('bridge failed'))
    const view = render(<SoftwareUpdateSettingsSection />)

    expect(await screen.findByRole('alert')).toHaveTextContent('bridge failed')
    view.unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
