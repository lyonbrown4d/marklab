import { describe, expect, it, vi } from 'vitest'
import type { FsBufferStatus } from '@electron/services/workspace/types'
import type { WorkspaceTreeDeltaEvent } from '@/types/workspaceTree'
import { bindWorkspaceRendererEvents } from '@electron/services/workspace/workspaceRendererEvents'

const delta = {
  generation: 0,
  kind: 'changes',
  previousRevision: 2,
  revision: 3,
  root: { kind: 'internal', path: '/workspace' },
  changes: [{ type: 'added', entry: { kind: 'file', path: 'new.md', name: 'new.md' } }],
} satisfies WorkspaceTreeDeltaEvent
const status = { path: 'new.md', revision: 3, dirty: false } satisfies FsBufferStatus

const createHarness = () => {
  const treeChanges = new Set<(value: WorkspaceTreeDeltaEvent) => void>()
  const statuses = new Set<(value: FsBufferStatus) => void>()
  const window = {
    isDestroyed: vi.fn(() => false),
    webContents: { isDestroyed: vi.fn(() => false), send: vi.fn() },
  }
  const logger = { warn: vi.fn() }
  const dispose = bindWorkspaceRendererEvents({
    window,
    logger,
    service: {
      onTreeChanged: (listener) => {
        treeChanges.add(listener)
        return () => {
          treeChanges.delete(listener)
        }
      },
      onBufferStatus: (listener) => {
        statuses.add(listener)
        return () => {
          statuses.delete(listener)
        }
      },
    },
  })
  return {
    window,
    logger,
    dispose,
    treeChanges,
    statuses,
    emitTreeChange: () => {
      for (const listener of treeChanges) listener(delta)
    },
    emitStatus: () => {
      for (const listener of statuses) listener(status)
    },
  }
}

describe('workspace renderer events', () => {
  it('forwards file snapshots and buffer status using the existing renderer channels', () => {
    const harness = createHarness()
    harness.emitTreeChange()
    harness.emitStatus()
    expect(harness.window.webContents.send.mock.calls).toEqual([
      ['fs-changed', delta],
      ['fs-buffer-status', status],
    ])
    harness.dispose()
  })

  it('does not broadcast one workspace into another window', () => {
    const first = createHarness()
    const second = createHarness()
    first.emitTreeChange()
    first.emitStatus()
    expect(first.window.webContents.send).toHaveBeenCalledTimes(2)
    expect(second.window.webContents.send).not.toHaveBeenCalled()
    first.dispose()
    second.dispose()
  })

  it.each(['window', 'webContents'] as const)('does not send to a destroyed %s', (target) => {
    const harness = createHarness()
    const destroyed = target === 'window' ? harness.window : harness.window.webContents
    destroyed.isDestroyed.mockReturnValue(true)
    harness.emitTreeChange()
    harness.emitStatus()
    expect(harness.window.webContents.send).not.toHaveBeenCalled()
    harness.dispose()
  })

  it('removes subscriptions and suppresses already captured callbacks after detach', () => {
    const harness = createHarness()
    const callbacks = [...harness.treeChanges]
    harness.dispose()
    harness.dispose()
    for (const listener of callbacks) listener(delta)
    expect(harness.treeChanges.size).toBe(0)
    expect(harness.statuses.size).toBe(0)
    expect(harness.window.webContents.send).not.toHaveBeenCalled()
  })

  it('reports a send failure without breaking a completed save', () => {
    const harness = createHarness()
    const error = new Error('Renderer closed during send')
    harness.window.webContents.send.mockImplementation(() => {
      throw error
    })
    expect(harness.emitStatus).not.toThrow()
    expect(harness.logger.warn).toHaveBeenCalledWith(
      'workspace renderer event could not be delivered',
      { event: 'fs-buffer-status', error },
    )
    harness.dispose()
  })
})
