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
  it('rejects retry, activation and readiness for a closed acquired window', async () => {
    const window = createWindow(1)
    const loadMainWindow = vi.fn(async () => undefined)
    const loadOpeningWindow = vi.fn(async () => undefined)
    const pool = createMarklabWindowPool(createLogger(), {
      createMainWindow: () => window,
      hasMemoryHeadroom: () => true,
      loadMainWindow,
      loadOpeningWindow,
    })
    const acquisition = await pool.acquireMainWindow()
    await pool.activateMainWindow(acquisition)
    await pool.restoreOpeningWindow(acquisition)
    expect(loadMainWindow).toHaveBeenCalledWith(window, undefined)
    expect(loadOpeningWindow).toHaveBeenCalledTimes(2)
    window.destroy()
    await expect(pool.activateMainWindow(acquisition)).rejects.toThrow('unavailable')
    await expect(pool.restoreOpeningWindow(acquisition)).rejects.toThrow('unavailable')
    await expect(pool.waitForRendererInteractive(acquisition)).rejects.toThrow('unavailable')
    await pool.dispose()
    await pool.dispose()
    await pool.prewarmMainWindow()
    await expect(pool.acquireMainWindow()).rejects.toThrow('disposed')
  })

  it('rejects activation when its web contents have crashed without a window close event', async () => {
    const window = createWindow(1)
    const pool = createMarklabWindowPool(createLogger(), {
      createMainWindow: () => window,
      hasMemoryHeadroom: () => true,
      loadMainWindow: vi.fn(async () => undefined),
      loadOpeningWindow: vi.fn(async () => undefined),
    })
    const acquisition = await pool.acquireMainWindow()
    window.webContents.isDestroyed = () => true
    await expect(pool.activateMainWindow(acquisition)).rejects.toThrow('unavailable')
    await expect(pool.waitForRendererInteractive(acquisition)).rejects.toThrow('unavailable')
    await pool.dispose()
  })

  it('falls back to a cold window when an in-flight prewarm rejects', async () => {
    const damaged = createWindow(1)
    const cold = createWindow(2)
    const createMainWindow = vi.fn().mockReturnValueOnce(damaged).mockReturnValueOnce(cold)
    let rejectPrewarm: (error: Error) => void = () => undefined
    const loadMainWindow = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          rejectPrewarm = reject
        }),
    )
    const loadOpeningWindow = vi.fn(async () => undefined)
    const logger = createLogger()
    const pool = createMarklabWindowPool(logger, {
      createMainWindow,
      hasMemoryHeadroom: () => true,
      loadMainWindow,
      loadOpeningWindow,
    })

    const prewarm = pool.prewarmMainWindow()
    const acquisition = pool.acquireMainWindow()

    const prewarmFailure = expect(prewarm).rejects.toThrow('standby load failed')
    expect(loadMainWindow).toHaveBeenCalledWith(damaged, { standby: true })
    expect(createMainWindow).toHaveBeenCalledOnce()
    rejectPrewarm(new Error('standby load failed'))
    await prewarmFailure
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
    let rejectReplacement: (error: Error) => void = () => undefined
    const replacementLoad = new Promise<void>((_, reject) => {
      rejectReplacement = reject
    })
    const loadMainWindow = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockReturnValueOnce(replacementLoad)
    const logger = createLogger()
    const pool = createMarklabWindowPool(logger, {
      createMainWindow,
      hasMemoryHeadroom: () => true,
      loadMainWindow,
      loadOpeningWindow: vi.fn(async () => undefined),
    })

    await pool.acquireMainWindow()
    await pool.prewarmMainWindow()
    expect(pool.stats().idleMainWindows).toBe(1)
    expect(loadMainWindow).toHaveBeenCalledWith(damaged, { standby: true })
    damaged.webContents.emit('render-process-gone')
    expect(loadMainWindow).toHaveBeenCalledWith(replacement, { standby: true })
    rejectReplacement(new Error('replacement failed'))

    await vi.waitFor(() =>
      expect(logger.warn).toHaveBeenCalledWith(
        'unable to replenish window pool after renderer crash',
        expect.objectContaining({ error: expect.any(Error) }),
      ),
    )
    expect(replacement.destroy).toHaveBeenCalledOnce()
    expect(pool.stats().idleMainWindows).toBe(0)
  })
})
