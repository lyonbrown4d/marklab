import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Logger } from '@electron/services/logger'

const updaterEvents = vi.hoisted(() => new Map<string, (...args: unknown[]) => void>())
const autoUpdaterMock = vi.hoisted(() => ({
  autoDownload: true,
  autoInstallOnAppQuit: true,
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    updaterEvents.set(event, handler)
  }),
  removeListener: vi.fn(),
  quitAndInstall: vi.fn(),
}))

vi.mock('electron-updater', () => ({ autoUpdater: autoUpdaterMock }))

const logger = {
  child: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
} as unknown as Logger

describe('update release notes', () => {
  beforeEach(() => updaterEvents.clear())

  it('converts string release notes to bounded plain text', async () => {
    const { createUpdateService } = await import('@electron/services/updater/service')
    const service = createUpdateService({ isPackaged: true, logger })

    updaterEvents.get('update-available')?.({
      releaseNotes: `<h2>Highlights</h2><p>${'safe '.repeat(1_000)}</p>`,
      version: '0.3.0',
    })

    const notes = service.getState().info?.releaseNotes
    expect(notes).toContain('Highlights')
    expect(notes).not.toContain('<h2>')
    expect(notes?.length).toBeLessThanOrEqual(4_000)
  })

  it('joins array release notes as plain text', async () => {
    const { createUpdateService } = await import('@electron/services/updater/service')
    const service = createUpdateService({ isPackaged: true, logger })

    updaterEvents.get('update-available')?.({
      releaseNotes: [
        { note: '<b>Fixed crashes</b>', version: '0.3.0' },
        { note: 'Improved startup', version: '0.2.9' },
      ],
      version: '0.3.0',
    })

    expect(service.getState().info?.releaseNotes).toBe('Fixed crashes\n\nImproved startup')
  })
})
