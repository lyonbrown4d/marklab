import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { createWindowLifecycle } from '@electron/main/windowLifecycle'
import {
  WorkspaceMutationGate,
  WorkspaceShutdownBarrier,
} from '@electron/services/workspace/workspaceShutdownBarrier'

vi.mock('@electron/windowPool', () => ({ createMarklabWindowPool: vi.fn() }))

const createHarness = () => {
  const gate = new WorkspaceMutationGate()
  const barrier = new WorkspaceShutdownBarrier()
  let dirty = true
  let destroyed = false
  const participants = [
    {
      currentEpoch: () => 1,
      gate,
      hasDirtyBuffers: () => dirty,
      id: 42,
    },
  ]
  const save = vi.fn(async () => {
    dirty = false
  })
  const workspace = {
    beginShutdownBarrier: vi.fn((reason: string) => barrier.begin(reason, participants)),
    cancelShutdownBarrier: vi.fn((id: number) => barrier.cancel(id)),
    completeShutdownBarrier: vi.fn((id: number) => barrier.complete(id)),
    flushBuffersForShutdown: vi.fn(async (id: number) => {
      await save()
      barrier.review(id, participants)
      return 1
    }),
    flushWindowForClose: vi.fn(async () => {
      await save()
    }),
    registerWindow: vi.fn(),
  }
  const webTabManager = { registerWindow: vi.fn() }
  const requestRendererFlush = vi.fn(async (window: BrowserWindow): Promise<void> => {
    void window
  })
  const persistWindowState = vi.fn(async () => undefined)
  const logger = {
    child: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }
  const nativeIpc = { commands: { workspace }, windowClose: { requestRendererFlush } }
  let servicesAvailable = true
  const options = {
    getServices: () => {
      if (!servicesAvailable) throw new Error('dependency container released')
      return { logger, webTabManager, workspaceRegistry: workspace }
    },
    getNativeIpc: () => nativeIpc,
    persistWindowState,
    getWindows: () => null,
    setWindows: vi.fn(),
  } satisfies Parameters<typeof createWindowLifecycle>[0]
  const lifecycle = createWindowLifecycle(options)
  const windowEmitter = Object.assign(new EventEmitter(), {
    id: 42,
    isDestroyed: () => destroyed,
    close: vi.fn(() => {
      const event = { preventDefault: vi.fn() }
      windowEmitter.emit('close', event)
      if (!event.preventDefault.mock.calls.length) {
        destroyed = true
        windowEmitter.emit('closed')
      }
    }),
  })
  const window = windowEmitter as unknown as BrowserWindow & typeof windowEmitter
  return {
    gate,
    lifecycle,
    logger,
    persistWindowState,
    requestRendererFlush,
    releaseServices: () => {
      servicesAvailable = false
    },
    save,
    webTabManager,
    window,
    workspace,
  }
}

describe('window persistence shutdown barrier', () => {
  it('waits for admitted writes and completes the barrier when quit continues', async () => {
    const { gate, lifecycle, requestRendererFlush, save, window } = createHarness()
    lifecycle.installManagedMainWindowLifecycle(window)
    let finishWrite!: () => void
    const pending = new Promise<void>((resolve) => {
      finishWrite = resolve
    })
    const write = gate.runAsync('write', () => pending)
    const event = { preventDefault: vi.fn() }
    const continueQuit = vi.fn()
    lifecycle.handleBeforeQuit(event, continueQuit)
    lifecycle.handleBeforeQuit(event, continueQuit)
    expect(event.preventDefault).toHaveBeenCalledTimes(2)
    expect(save).not.toHaveBeenCalled()
    expect(requestRendererFlush).toHaveBeenCalledWith(window)
    expect(continueQuit).not.toHaveBeenCalled()
    finishWrite()
    await write
    await vi.waitFor(() => expect(continueQuit).toHaveBeenCalledTimes(1))
    expect(save).toHaveBeenCalledTimes(1)
    expect(gate.reason).toBeNull()
    await expect(gate.runAsync('late write', async () => undefined)).resolves.toBeUndefined()
  })

  it('awaits application shutdown once and lets the recursive quit pass through', async () => {
    const { lifecycle } = createHarness()
    let finishShutdown!: () => void
    const shutdown = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishShutdown = resolve
        }),
    )
    const continueQuit = vi.fn()
    const firstEvent = { preventDefault: vi.fn() }
    const repeatedEvent = { preventDefault: vi.fn() }

    lifecycle.handleBeforeQuit(firstEvent, continueQuit, shutdown)
    lifecycle.handleBeforeQuit(repeatedEvent, continueQuit, shutdown)
    await vi.waitFor(() => expect(shutdown).toHaveBeenCalledOnce())
    expect(firstEvent.preventDefault).toHaveBeenCalledOnce()
    expect(repeatedEvent.preventDefault).toHaveBeenCalledOnce()
    expect(continueQuit).not.toHaveBeenCalled()

    finishShutdown()
    await vi.waitFor(() => expect(continueQuit).toHaveBeenCalledOnce())

    const recursiveEvent = { preventDefault: vi.fn() }
    lifecycle.handleBeforeQuit(recursiveEvent, continueQuit, shutdown)
    expect(recursiveEvent.preventDefault).not.toHaveBeenCalled()
    expect(shutdown).toHaveBeenCalledOnce()
    expect(continueQuit).toHaveBeenCalledOnce()
  })

  it('persists managed window state before application services shut down', async () => {
    const { lifecycle, persistWindowState, window } = createHarness()
    lifecycle.installManagedMainWindowLifecycle(window)
    const order: string[] = []
    persistWindowState.mockImplementationOnce(async () => {
      order.push('window-state')
    })
    const shutdown = vi.fn(async () => {
      order.push('shutdown')
    })

    lifecycle.handleBeforeQuit({ preventDefault: vi.fn() }, vi.fn(), shutdown)

    await vi.waitFor(() => expect(shutdown).toHaveBeenCalledOnce())
    expect(order).toEqual(['window-state', 'shutdown'])
  })

  it('does not resolve services after application shutdown releases the container', async () => {
    const { lifecycle, logger, releaseServices } = createHarness()
    const continueQuit = vi.fn()
    const shutdown = vi.fn(async () => {
      releaseServices()
    })

    lifecycle.handleBeforeQuit({ preventDefault: vi.fn() }, continueQuit, shutdown)

    await vi.waitFor(() => expect(continueQuit).toHaveBeenCalledOnce())
    expect(logger.info).toHaveBeenCalledWith('app quit continuing after flush')
  })

  it('cancels quit on a real save failure, unfreezes, and permits a later retry', async () => {
    const { gate, lifecycle, logger, save, workspace } = createHarness()
    const error = new Error('ENOSPC: disk full')
    save.mockRejectedValueOnce(error)
    const continueQuit = vi.fn()
    lifecycle.handleBeforeQuit({ preventDefault: vi.fn() }, continueQuit)
    await vi.waitFor(() =>
      expect(logger.error).toHaveBeenCalledWith(
        'app quit cancelled because workspace buffers could not be saved',
        { error },
      ),
    )
    expect(continueQuit).not.toHaveBeenCalled()
    expect(workspace.cancelShutdownBarrier).toHaveBeenCalledTimes(1)
    expect(gate.reason).toBeNull()
    lifecycle.handleBeforeQuit({ preventDefault: vi.fn() }, continueQuit)
    await vi.waitFor(() => expect(continueQuit).toHaveBeenCalledTimes(1))
    expect(gate.reason).toBeNull()
  })

  it('keeps the window open on save failure and closes it only after a successful retry', async () => {
    const { gate, lifecycle, logger, save, webTabManager, window } = createHarness()
    lifecycle.installManagedMainWindowLifecycle(window)
    lifecycle.installManagedMainWindowLifecycle(window)
    expect(window.listenerCount('close')).toBe(1)
    expect(webTabManager.registerWindow).toHaveBeenCalledExactlyOnceWith(window)
    save.mockRejectedValueOnce(new Error('EACCES: permission denied'))
    window.close()
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalled())
    expect(window.isDestroyed()).toBe(false)
    expect(gate.reason).toBeNull()
    window.close()
    await vi.waitFor(() => expect(window.isDestroyed()).toBe(true))
    expect(gate.reason).toBeNull()
  })

  it('flushes only the closing window and does not freeze other workspace sessions', async () => {
    const { lifecycle, requestRendererFlush, window, workspace } = createHarness()
    lifecycle.installManagedMainWindowLifecycle(window)

    window.close()
    await vi.waitFor(() => expect(window.isDestroyed()).toBe(true))

    expect(requestRendererFlush).toHaveBeenCalledWith(window)
    expect(workspace.flushWindowForClose).toHaveBeenCalledWith(window)
    expect(workspace.beginShutdownBarrier).not.toHaveBeenCalled()
    expect(workspace.flushBuffersForShutdown).not.toHaveBeenCalled()
  })

  it('waits for the renderer snapshot and buffer flush before closing the workspace', async () => {
    const { lifecycle, requestRendererFlush, window, workspace } = createHarness()
    let finishRendererFlush!: () => void
    requestRendererFlush.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishRendererFlush = resolve
      }),
    )
    lifecycle.installManagedMainWindowLifecycle(window)

    window.close()
    await vi.waitFor(() => expect(requestRendererFlush).toHaveBeenCalledWith(window))
    expect(workspace.flushWindowForClose).not.toHaveBeenCalled()
    expect(window.isDestroyed()).toBe(false)

    finishRendererFlush()
    await vi.waitFor(() => expect(window.isDestroyed()).toBe(true))
    expect(workspace.flushWindowForClose).toHaveBeenCalledWith(window)
  })

  it('rejects shutdown when buffers remain dirty despite a fulfilled save', async () => {
    const { gate, lifecycle, logger, save } = createHarness()
    save.mockResolvedValueOnce(undefined)
    const continueQuit = vi.fn()
    lifecycle.handleBeforeQuit({ preventDefault: vi.fn() }, continueQuit)
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalled())
    expect(continueQuit).not.toHaveBeenCalled()
    expect(gate.reason).toBeNull()
  })
})
