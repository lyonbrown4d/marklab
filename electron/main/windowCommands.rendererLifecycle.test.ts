import { EventEmitter } from 'node:events'

import { BrowserWindow } from 'electron'
import { describe, expect, it, vi } from 'vitest'

import { nativeIpcChannels } from '@electron/channels'
import { createAppWindowCommandHandlers } from '@electron/main/windowCommands'
import type { WindowPoolAcquisition } from '@electron/windowPool'

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: vi.fn(), getFocusedWindow: vi.fn() },
}))
vi.mock('@electron/windowMotion', () => ({ showWindowWithMotion: vi.fn() }))

const createWindow = (id: number) => {
  let destroyed = false
  const webContents = Object.assign(new EventEmitter(), {
    id: id * 10,
    isDestroyed: () => destroyed,
    send: vi.fn(),
  })
  const window = Object.assign(new EventEmitter(), {
    id,
    webContents,
    destroy: vi.fn(() => {
      destroyed = true
      window.emit('closed')
    }),
    isDestroyed: () => destroyed,
    isMinimized: () => false,
  })
  return window as unknown as BrowserWindow
}

const createHarness = () => {
  const source = createWindow(1)
  const target = createWindow(2)
  let finishInteractive!: () => void
  let failInteractive!: (error: Error) => void
  const interactive = new Promise<void>((resolve, reject) => {
    finishInteractive = resolve
    failInteractive = reject
  })
  const workspace = {
    beginRendererHydration: vi.fn(),
    markRendererInteractive: vi.fn(),
    setRoot: vi.fn(async () => ({ kind: 'external' as const, path: '/notes' })),
  }
  const pool = {
    acquireMainWindow: vi.fn<() => Promise<WindowPoolAcquisition>>(async () => ({
      metrics: {
        constructorCallsAvoided: 1,
        openingShellLoadsAvoided: 1,
        preparationDurationMs: 3,
      },
      source: 'pool',
      window: target,
    })),
    activateMainWindow: vi.fn(async () => undefined),
    prewarmMainWindow: vi.fn(async () => undefined),
    restoreOpeningWindow: vi.fn(async () => undefined),
    stats: vi.fn(() => ({ poolHits: 1 })),
    waitForRendererInteractive: vi.fn(() => interactive),
  }
  const handlers = createAppWindowCommandHandlers({
    activateWorkspaceWindowState: vi.fn(),
    copyWorkspaceSession: vi.fn(() => ({ state: { rootPath: '/notes' }, version: 1 })),
    getCurrentWorkspaceRoot: () => ({ kind: 'external' as const, path: '/notes' }),
    getLogger: () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
    getNativeIpc: () => null,
    getPrimaryWindow: () => source,
    getSessionKeyForWindow: (window: BrowserWindow) => `session-${window.id}`,
    getWorkspaceServiceForWindow: () => workspace,
    getWindowPool: () => pool,
    installManagedMainWindowLifecycle: vi.fn(),
    writeWorkspaceSession: vi.fn(),
  } as never)
  return { failInteractive, finishInteractive, handlers, pool, source, target, workspace }
}

describe('workspace window renderer lifecycle', () => {
  it('replenishes the pool only after the target workspace is interactive', async () => {
    const { finishInteractive, handlers, pool, source, target, workspace } = createHarness()
    const opened = handlers.open_current_workspace_in_new_window(undefined, {
      sender: source.webContents,
    } as never)

    await vi.waitFor(() =>
      expect(target.webContents.send).toHaveBeenCalledWith(
        nativeIpcChannels.workspaceSessionSeed,
        expect.anything(),
      ),
    )
    expect(pool.prewarmMainWindow).not.toHaveBeenCalled()
    expect(workspace.markRendererInteractive).not.toHaveBeenCalled()

    finishInteractive()
    await expect(opened).resolves.toMatchObject({ ok: true })
    expect(workspace.markRendererInteractive).toHaveBeenCalledOnce()
    expect(pool.prewarmMainWindow).toHaveBeenCalledOnce()
  })

  it('keeps the loading renderer retryable when hydration reports an error', async () => {
    const { failInteractive, handlers, pool, source, target, workspace } = createHarness()
    const opened = handlers.open_current_workspace_in_new_window(undefined, {
      sender: source.webContents,
    } as never)
    await vi.waitFor(() => expect(pool.waitForRendererInteractive).toHaveBeenCalledOnce())

    failInteractive(new Error('renderer hydration failed'))

    await expect(opened).resolves.toMatchObject({ ok: false, error: 'renderer hydration failed' })
    expect(workspace.markRendererInteractive).not.toHaveBeenCalled()
    expect(pool.prewarmMainWindow).not.toHaveBeenCalled()
    expect(target.webContents.send).toHaveBeenLastCalledWith(
      nativeIpcChannels.windowOpeningProgress,
      expect.objectContaining({ error: 'renderer hydration failed', stage: 'failed' }),
    )
  })

  it('delivers one activation seed without a delayed duplicate workspace load', async () => {
    vi.useFakeTimers()
    try {
      const { finishInteractive, handlers, source, target } = createHarness()
      const opened = handlers.open_current_workspace_in_new_window(undefined, {
        sender: source.webContents,
      } as never)
      finishInteractive()
      await opened
      await vi.advanceTimersByTimeAsync(300)

      const seedDeliveries = vi
        .mocked(target.webContents.send)
        .mock.calls.filter(([channel]) => channel === nativeIpcChannels.workspaceSessionSeed)
      expect(seedDeliveries).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not retain a retry after the target closes during readiness rejection', async () => {
    const { failInteractive, handlers, pool, source, target } = createHarness()
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(target)
    const opened = handlers.open_current_workspace_in_new_window(undefined, {
      sender: source.webContents,
    } as never)
    await vi.waitFor(() => expect(pool.waitForRendererInteractive).toHaveBeenCalledOnce())

    target.destroy()
    failInteractive(new Error('window closed'))
    await opened

    expect(
      handlers.retry_window_open(undefined, { sender: target.webContents } as never),
    ).toMatchObject({
      error: 'No failed workspace open is available to retry.',
      ok: false,
    })
  })

  it('replays the latest opening progress after cold renderer navigation', async () => {
    const { finishInteractive, handlers, pool, source, target } = createHarness()
    pool.acquireMainWindow.mockResolvedValueOnce({
      metrics: {
        constructorCallsAvoided: 0,
        openingShellLoadsAvoided: 0,
        preparationDurationMs: 3,
      },
      source: 'cold',
      window: target,
    })

    const opened = handlers.open_current_workspace_in_new_window(undefined, {
      sender: source.webContents,
    } as never)
    await vi.waitFor(() => expect(pool.activateMainWindow).toHaveBeenCalledOnce())
    finishInteractive()
    await opened

    const progress = vi
      .mocked(target.webContents.send)
      .mock.calls.filter(([channel]) => channel === nativeIpcChannels.windowOpeningProgress)
      .map(([, payload]) => payload)
    expect(progress).toEqual([
      expect.objectContaining({ stage: 'starting' }),
      expect.objectContaining({ stage: 'loading' }),
      expect.objectContaining({ stage: 'indexing' }),
      expect.objectContaining({ stage: 'indexing' }),
    ])
  })
})
