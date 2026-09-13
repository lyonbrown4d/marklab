import { describe, expect, it, vi } from 'vitest'
import type { FsBufferStatus, FsSnapshot } from '@electron/services/workspace/types.js'
import { bindWorkspaceRendererEvents } from '@electron/services/workspace/workspaceRendererEvents.js'

const snapshot = {
  root: { kind: 'internal', path: '/workspace' },
  entries: [{ kind: 'file', path: 'new.md', name: 'new.md' }],
} satisfies FsSnapshot
const status = { path: 'new.md', revision: 3, dirty: false } satisfies FsBufferStatus

const createHarness = () => {
  const snapshots = new Set<(value: FsSnapshot) => void>()
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
      onSnapshotChanged: (listener) => {
        snapshots.add(listener)
        return () => {
          snapshots.delete(listener)
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
    snapshots,
    statuses,
    emitSnapshot: () => {
      for (const listener of snapshots) listener(snapshot)
    },
    emitStatus: () => {
      for (const listener of statuses) listener(status)
    },
  }
}

describe('workspace renderer events', () => {
  it('forwards file snapshots and buffer status using the existing renderer channels', () => {
    const harness = createHarness()
    harness.emitSnapshot()
    harness.emitStatus()
    expect(harness.window.webContents.send.mock.calls).toEqual([
      ['fs-changed', snapshot],
      ['fs-buffer-status', status],
    ])
    harness.dispose()
  })

  it('does not broadcast one workspace into another window', () => {
    const first = createHarness()
    const second = createHarness()
    first.emitSnapshot()
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
    harness.emitSnapshot()
    harness.emitStatus()
    expect(harness.window.webContents.send).not.toHaveBeenCalled()
    harness.dispose()
  })

  it('removes subscriptions and suppresses already captured callbacks after detach', () => {
    const harness = createHarness()
    const callbacks = [...harness.snapshots]
    harness.dispose()
    harness.dispose()
    for (const listener of callbacks) listener(snapshot)
    expect(harness.snapshots.size).toBe(0)
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
