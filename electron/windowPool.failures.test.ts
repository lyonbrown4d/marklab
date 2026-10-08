import { EventEmitter } from 'node:events'

import type { BrowserWindow } from 'electron'
import { describe, expect, it, vi } from 'vitest'

import type { Logger } from '@electron/services/logger'
import { createMarklabWindowPool } from '@electron/windowPool'

vi.mock('electron', () => ({
  app: { isPackaged: true },
  BrowserWindow: vi.fn(),
  nativeTheme: { shouldUseDarkColors: false },
  screen: { getAllDisplays: vi.fn(() => []) },
}))
vi.mock('@electron/window', () => ({
  createMainWindow: vi.fn(),
  loadMainWindow: vi.fn(),
  loadWindowOpeningShell: vi.fn(),
}))

const createWindow = (id: number) => {
  let destroyed = false
  const webContents = Object.assign(new EventEmitter(), {
    isDestroyed: () => destroyed,
  })
  const window = Object.assign(new EventEmitter(), {
    id,
    webContents,
    destroy: vi.fn(() => {
      destroyed = true
      window.emit('closed')
    }),
    hide: vi.fn(),
    isDestroyed: () => destroyed,
    isVisible: () => false,
  })
  return window as unknown as BrowserWindow
}

const createLogger = () => {
  const logger = {
    child: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }
  logger.child.mockReturnValue(logger)
  return logger as unknown as Logger
}

describe('MarklabWindowPool failure recovery', () => {
  it('falls back to a cold window when an in-flight prewarm rejects', async () => {
    const damaged = createWindow(1)
    const cold = createWindow(2)
    const createMainWindow = vi.fn().mockReturnValueOnce(damaged).mockReturnValueOnce(cold)
    const loadMainWindow = vi.fn().mockRejectedValueOnce(new Error('standby load failed'))
    const loadOpeningWindow = vi.fn(async () => undefined)
    const logger = createLogger()
    const pool = createMarklabWindowPool(logger, {
      createMainWindow,
      loadMainWindow,
      loadOpeningWindow,
    })

    const prewarm = pool.prewarmMainWindow()
    const acquisition = pool.acquireMainWindow()

    await expect(prewarm).rejects.toThrow('standby load failed')
    await expect(acquisition).resolves.toMatchObject({ source: 'cold', window: cold })
    expect(damaged.destroy).toHaveBeenCalledOnce()
    expect(loadOpeningWindow).toHaveBeenCalledWith(cold)
    expect(logger.warn).toHaveBeenCalledWith(
      'standby renderer prewarm failed; falling back to a cold window',
      expect.objectContaining({ error: expect.any(Error) }),
    )
  })

  it('handles a failed automatic replenishment after an idle renderer crashes', async () => {
    const active = createWindow(1)
    const damaged = createWindow(2)
    const replacement = createWindow(3)
    const createMainWindow = vi
      .fn()
      .mockReturnValueOnce(active)
      .mockReturnValueOnce(damaged)
      .mockReturnValueOnce(replacement)
    const loadMainWindow = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('replacement failed'))
    const logger = createLogger()
    const pool = createMarklabWindowPool(logger, {
      createMainWindow,
      loadMainWindow,
      loadOpeningWindow: vi.fn(async () => undefined),
    })

    await pool.acquireMainWindow()
    await pool.prewarmMainWindow()
    damaged.webContents.emit('render-process-gone')

    await vi.waitFor(() =>
      expect(logger.warn).toHaveBeenCalledWith(
        'unable to replenish window pool after renderer crash',
        expect.objectContaining({ error: expect.any(Error) }),
      ),
    )
  })
})
