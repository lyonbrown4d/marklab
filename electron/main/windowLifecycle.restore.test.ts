import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { createWindowLifecycle } from '@electron/main/windowLifecycle'
import { noopLogger } from '@electron/services/logger'

vi.mock('@electron/windowPool', () => ({ createMarklabWindowPool: vi.fn() }))

const harness = () => {
  const window = Object.assign(new EventEmitter(), {
    id: 1,
    isDestroyed: () => false,
    close: vi.fn(),
  }) as unknown as BrowserWindow & EventEmitter
  const logger = { ...noopLogger, error: vi.fn() }
  const persistWorkspaceSessions = vi.fn()
  const setWindows = vi.fn()
  const workspace = {
    beginShutdownBarrier: vi.fn(async () => 1),
    cancelShutdownBarrier: vi.fn(),
    completeShutdownBarrier: vi.fn(),
    flushBuffersForShutdown: vi.fn(async () => 0),
    flushWindowForClose: vi.fn(async () => undefined),
    registerWindow: vi.fn(),
  }
  const nativeIpc = {
    commands: { workspace },
    windowClose: { requestRendererFlush: vi.fn(async () => undefined) },
  }
  let available = true
  const lifecycle = createWindowLifecycle({
    finalizeWindowState: vi.fn(),
    flushWindowState: vi.fn(),
    persistWorkspaceSessions,
    getNativeIpc: () => (available ? nativeIpc : null),
    getServices: () => ({
      logger,
      workspaceRegistry: workspace,
      webTabManager: { registerWindow: vi.fn() },
    }),
    getWindows: () => ({ main: window, splash: window }),
    setWindows,
  })
  return {
    lifecycle,
    logger,
    persistWorkspaceSessions,
    setWindows,
    window,
    workspace,
    disableIpc: () => {
      available = false
    },
  }
}

describe('workspace window snapshot shutdown boundaries', () => {
  it('does not intercept quit without native IPC and rejects an explicit buffer flush', async () => {
    const { disableIpc, lifecycle, persistWorkspaceSessions } = harness()
    disableIpc()
    const event = { preventDefault: vi.fn() }
    lifecycle.handleBeforeQuit(event, vi.fn())
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(persistWorkspaceSessions).not.toHaveBeenCalled()
    await expect(lifecycle.flushWorkspaceBuffers('test')).rejects.toThrow(
      'Workspace flush is unavailable',
    )
  })

  it('keeps a window open if native IPC disappears before its close flush', async () => {
    const { disableIpc, lifecycle, logger, window } = harness()
    lifecycle.installManagedMainWindowLifecycle(window)
    disableIpc()
    window.emit('close', { preventDefault: vi.fn() })
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalled())
    expect(window.close).not.toHaveBeenCalled()
  })

  it('cancels quit when its workspace snapshot cannot be saved and allows a retry', async () => {
    const { lifecycle, logger, persistWorkspaceSessions, window, workspace } = harness()
    lifecycle.installManagedMainWindowLifecycle(window)
    persistWorkspaceSessions.mockImplementationOnce(() => {
      throw new Error('snapshot save failed')
    })
    const continueQuit = vi.fn()
    lifecycle.handleBeforeQuit({ preventDefault: vi.fn() }, continueQuit)
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalled())
    expect(continueQuit).not.toHaveBeenCalled()
    expect(workspace.cancelShutdownBarrier).toHaveBeenCalledWith(1)
    lifecycle.handleBeforeQuit({ preventDefault: vi.fn() }, continueQuit)
    await vi.waitFor(() => expect(continueQuit).toHaveBeenCalledOnce())
    expect(persistWorkspaceSessions).toHaveBeenLastCalledWith([window])
  })

  it('excludes destroyed windows and releases the closed primary window', async () => {
    const { lifecycle, persistWorkspaceSessions, setWindows, window } = harness()
    const destroyed = Object.assign(new EventEmitter(), {
      id: 2,
      isDestroyed: () => true,
    }) as unknown as BrowserWindow
    lifecycle.installManagedMainWindowLifecycle(destroyed)
    lifecycle.installManagedMainWindowLifecycle(window)
    window.emit('closed')
    expect(setWindows).toHaveBeenCalledWith(null)
    const continueQuit = vi.fn()
    lifecycle.handleBeforeQuit({ preventDefault: vi.fn() }, continueQuit)
    await vi.waitFor(() => expect(continueQuit).toHaveBeenCalledOnce())
    expect(persistWorkspaceSessions).toHaveBeenCalledWith([])
  })
})
