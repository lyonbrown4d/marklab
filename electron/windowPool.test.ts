import { EventEmitter } from 'node:events'

import type { BrowserWindow } from 'electron'
import { describe, expect, it, vi } from 'vitest'

import { createMarklabWindowPool } from '@electron/windowPool'

vi.mock('@electron/services/logger', () => {
  const noopLogger = {
    child: () => noopLogger,
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }
  return { noopLogger }
})
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

const createWindow = (id: number, visible = false) => {
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
    isVisible: () => visible,
  })
  return window as unknown as BrowserWindow
}

const createHarness = (memoryHeadroom = true, visible = false) => {
  const windows = [createWindow(1, visible), createWindow(2, visible), createWindow(3, visible)]
  const createMainWindow = vi.fn(() => windows.shift()!)
  const loadMainWindow = vi.fn(async () => undefined)
  const loadOpeningWindow = vi.fn(async () => undefined)
  const pool = createMarklabWindowPool(undefined, {
    createMainWindow,
    hasMemoryHeadroom: () => memoryHeadroom,
    loadMainWindow,
    loadOpeningWindow,
    maxIdleMainWindows: 1,
    now: vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(14),
  })
  return { createMainWindow, loadMainWindow, loadOpeningWindow, pool }
}

describe('MarklabWindowPool', () => {
  it('prewarms one lightweight renderer without mounting the main application', async () => {
    const { createMainWindow, loadMainWindow, loadOpeningWindow, pool } = createHarness()

    await Promise.all([pool.prewarmMainWindow(), pool.prewarmMainWindow()])

    expect(createMainWindow).toHaveBeenCalledTimes(1)
    expect(loadOpeningWindow).toHaveBeenCalledTimes(1)
    expect(loadMainWindow).not.toHaveBeenCalled()
    expect(pool.stats()).toMatchObject({ idleMainWindows: 1, openingShellLoads: 1 })
  })

  it('hides a prewarmed renderer if the platform exposes it during loading', async () => {
    const { createMainWindow, pool } = createHarness(true, true)

    await pool.prewarmMainWindow()

    expect(createMainWindow.mock.results[0]?.value.hide).toHaveBeenCalledOnce()
  })

  it('records a pool hit and avoids constructor and shell-load work on the user path', async () => {
    const { createMainWindow, loadMainWindow, loadOpeningWindow, pool } = createHarness()
    await pool.prewarmMainWindow()
    createMainWindow.mockClear()
    loadOpeningWindow.mockClear()

    const acquisition = await pool.acquireMainWindow()
    await pool.activateMainWindow(acquisition)

    expect(acquisition.source).toBe('pool')
    expect(acquisition.metrics).toMatchObject({
      constructorCallsAvoided: 1,
      openingShellLoadsAvoided: 1,
    })
    expect(createMainWindow).not.toHaveBeenCalled()
    expect(loadOpeningWindow).not.toHaveBeenCalled()
    expect(loadMainWindow).toHaveBeenCalledOnce()
    expect(pool.stats()).toMatchObject({ coldStarts: 0, poolHits: 1, mainRendererLoads: 1 })
  })

  it('uses a cold lightweight shell when no prewarmed window is available', async () => {
    const { createMainWindow, loadMainWindow, loadOpeningWindow, pool } = createHarness()

    const acquisition = await pool.acquireMainWindow()
    await pool.activateMainWindow(acquisition)

    expect(acquisition.source).toBe('cold')
    expect(createMainWindow).toHaveBeenCalledOnce()
    expect(loadOpeningWindow).toHaveBeenCalledOnce()
    expect(loadMainWindow).toHaveBeenCalledOnce()
    expect(pool.stats()).toMatchObject({ coldStarts: 1, poolHits: 0 })
  })

  it('drops damaged idle renderers and enforces the idle cap across repeated prewarms', async () => {
    const { createMainWindow, pool } = createHarness()
    await pool.prewarmMainWindow()
    const damaged = createMainWindow.mock.results[0].value
    damaged.webContents.emit('render-process-gone')
    await pool.prewarmMainWindow()
    await pool.prewarmMainWindow()

    expect(damaged.destroy).toHaveBeenCalledOnce()
    expect(pool.stats().idleMainWindows).toBe(1)
    expect(createMainWindow).toHaveBeenCalledTimes(2)
  })

  it('does not retain hidden windows under memory pressure', async () => {
    const { createMainWindow, pool } = createHarness(false)

    await pool.prewarmMainWindow()

    expect(createMainWindow).not.toHaveBeenCalled()
    expect(pool.stats().idleMainWindows).toBe(0)
  })

  it('destroys idle windows when the final active window closes without intercepting close', async () => {
    const { pool } = createHarness()
    const active = await pool.acquireMainWindow()
    await pool.prewarmMainWindow()
    const closeEvent = { preventDefault: vi.fn() }

    active.window.emit('close', closeEvent)
    active.window.emit('closed')

    expect(closeEvent.preventDefault).not.toHaveBeenCalled()
    expect(pool.stats()).toMatchObject({ activeMainWindows: 0, idleMainWindows: 0 })
  })

  it('does not retain a prewarm that finishes after the pool is disposed', async () => {
    let finishOpening!: () => void
    const opening = new Promise<undefined>((resolve) => {
      finishOpening = () => resolve(undefined)
    })
    const { createMainWindow, loadOpeningWindow, pool } = createHarness()
    loadOpeningWindow.mockReturnValueOnce(opening)

    const prewarm = pool.prewarmMainWindow()
    await vi.waitFor(() => expect(createMainWindow).toHaveBeenCalledOnce())
    const disposal = pool.dispose()
    finishOpening()
    await Promise.all([disposal, prewarm])

    expect(createMainWindow.mock.results[0]?.value.destroy).toHaveBeenCalledOnce()
    expect(pool.stats().idleMainWindows).toBe(0)
  })

  it('destroys an in-flight prewarm when the final active window closes', async () => {
    let finishOpening!: () => void
    const opening = new Promise<undefined>((resolve) => {
      finishOpening = () => resolve(undefined)
    })
    const { createMainWindow, loadOpeningWindow, pool } = createHarness()
    const active = await pool.acquireMainWindow()
    loadOpeningWindow.mockReturnValueOnce(opening)

    const prewarm = pool.prewarmMainWindow()
    await vi.waitFor(() => expect(createMainWindow).toHaveBeenCalledTimes(2))
    const warming = createMainWindow.mock.results[1]?.value
    active.window.emit('closed')

    expect(warming.destroy).toHaveBeenCalledOnce()
    finishOpening()
    await prewarm
    expect(pool.stats()).toMatchObject({ activeMainWindows: 0, idleMainWindows: 0 })
  })

  it('does not wait indefinitely for an in-flight prewarm during disposal', async () => {
    const neverFinishes = new Promise<undefined>(() => undefined)
    const { createMainWindow, loadOpeningWindow, pool } = createHarness()
    loadOpeningWindow.mockReturnValueOnce(neverFinishes)

    void pool.prewarmMainWindow()
    await vi.waitFor(() => expect(createMainWindow).toHaveBeenCalledOnce())

    await expect(pool.dispose()).resolves.toBeUndefined()
    expect(createMainWindow.mock.results[0]?.value.destroy).toHaveBeenCalledOnce()
  })
})
