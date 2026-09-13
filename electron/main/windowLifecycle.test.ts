import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { createWindowLifecycle } from '@electron/main/windowLifecycle.js'
import {
  WorkspaceMutationGate,
  WorkspaceShutdownBarrier,
} from '@electron/services/workspace/workspaceShutdownBarrier.js'

vi.mock('@electron/windowPool.js', () => ({ createMarklabWindowPool: vi.fn() }))

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
    flushBuffersForShutdown: vi.fn(async (id: number) => {
      await save()
      barrier.review(id, participants)
      return 1
    }),
    registerWindow: vi.fn(),
  }
  const logger = {
    child: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }
  const nativeIpc = { commands: { workspace } }
  const options = {
    getContainer: () => ({ cradle: { logger, workspaceRegistry: workspace } }),
    getNativeIpc: () => nativeIpc,
    getWindows: () => null,
    setWindows: vi.fn(),
  } as unknown as Parameters<typeof createWindowLifecycle>[0]
  const lifecycle = createWindowLifecycle(options)
  const window = Object.assign(new EventEmitter(), {
    id: 42,
    isDestroyed: () => destroyed,
    close: vi.fn(() => {
      const event = { preventDefault: vi.fn() }
      window.emit('close', event)
      if (!event.preventDefault.mock.calls.length) {
        destroyed = true
        window.emit('closed')
      }
    }),
  })
  return { gate, lifecycle, logger, save, window, workspace }
}

describe('window persistence shutdown barrier', () => {
  it('waits for admitted writes and keeps mutations frozen when quit continues', async () => {
    const { gate, lifecycle, save } = createHarness()
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
    expect(continueQuit).not.toHaveBeenCalled()
    finishWrite()
    await write
    await vi.waitFor(() => expect(continueQuit).toHaveBeenCalledTimes(1))
    expect(save).toHaveBeenCalledTimes(1)
    expect(gate.reason).toBe('quit')
    await expect(gate.runAsync('late write', async () => undefined)).rejects.toMatchObject({
      code: 'workspace_mutation_frozen',
    })
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
    expect(gate.reason).toBe('quit')
  })

  it('keeps the window open on save failure and closes it only after a successful retry', async () => {
    const { gate, lifecycle, logger, save, window } = createHarness()
    lifecycle.installManagedMainWindowLifecycle(window as unknown as BrowserWindow)
    lifecycle.installManagedMainWindowLifecycle(window as unknown as BrowserWindow)
    expect(window.listenerCount('close')).toBe(1)
    save.mockRejectedValueOnce(new Error('EACCES: permission denied'))
    window.close()
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalled())
    expect(window.isDestroyed()).toBe(false)
    expect(gate.reason).toBeNull()
    window.close()
    await vi.waitFor(() => expect(window.isDestroyed()).toBe(true))
    expect(gate.reason).toBeNull()
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
