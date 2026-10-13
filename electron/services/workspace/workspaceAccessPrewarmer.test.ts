import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { noopLogger } from '@electron/services/logger'
import type { FsStateData } from '@electron/services/workspace/types'
import { WorkspacePathSnapshotCache } from '@electron/services/workspace/workspacePathSnapshotCache'
import {
  createWorkspaceFileAccessPrewarmer,
  WorkspaceAccessPrewarmer,
} from '@electron/services/workspace/workspaceAccessPrewarmer'

const mocks = vi.hoisted(() => ({ schedule: vi.fn(), sidecar: vi.fn() }))
vi.mock('@electron/services/workspace/workspacePrewarmScheduler', () => ({
  scheduleWorkspacePrewarm: mocks.schedule,
}))
vi.mock('@electron/services/workspace/workspaceSidecarFileBridge', () => ({
  tryPrewarmSidecarFileAccess: mocks.sidecar,
}))
beforeEach(() => {
  vi.useFakeTimers()
  mocks.schedule
    .mockReset()
    .mockImplementation((work: () => Promise<void>) => Promise.resolve().then(work))
  mocks.sidecar.mockReset().mockResolvedValue(undefined)
})
afterEach(() => {
  vi.useRealTimers()
})

describe('workspace access prewarmer', () => {
  it('reschedules pending work and never runs after disposal', async () => {
    const prepare = vi.fn(async () => undefined)
    const prewarmer = new WorkspaceAccessPrewarmer({
      prepare,
      rootKind: () => 'internal',
      logger: noopLogger,
      delayMs: 10,
    })
    prewarmer.schedule()
    await vi.advanceTimersByTimeAsync(5)
    prewarmer.schedule()
    await vi.advanceTimersByTimeAsync(5)
    expect(prepare).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(5)
    expect(prepare).toHaveBeenCalledTimes(1)
    prewarmer.schedule()
    prewarmer.dispose()
    prewarmer.schedule()
    await vi.runAllTimersAsync()
    expect(prepare).toHaveBeenCalledTimes(1)
  })

  it('cancels already queued work before the scheduler runs it', async () => {
    const prepare = vi.fn(async () => undefined)
    let queued!: () => Promise<void>
    mocks.schedule.mockImplementationOnce((work) => {
      queued = work
      return Promise.resolve()
    })
    const prewarmer = new WorkspaceAccessPrewarmer({
      prepare,
      rootKind: () => 'external',
      logger: noopLogger,
    })
    prewarmer.schedule()
    await vi.advanceTimersByTimeAsync(75)
    prewarmer.dispose()
    await queued()
    expect(prepare).not.toHaveBeenCalled()
  })

  it('reports preparation errors with current root context', async () => {
    const warn = vi.fn()
    const error = new Error('prewarm failed')
    const prewarmer = new WorkspaceAccessPrewarmer({
      prepare: vi.fn().mockRejectedValue(error),
      rootKind: () => 'single',
      logger: { ...noopLogger, warn },
    })
    prewarmer.schedule()
    await vi.advanceTimersByTimeAsync(75)
    expect(warn).toHaveBeenCalledWith('workspace access prewarm failed', {
      error,
      rootKind: 'single',
    })
    prewarmer.dispose()
  })

  it('starts local snapshot and sidecar preparation together using the current state', async () => {
    const state: FsStateData = {
      rootKind: 'internal',
      rootPath: '/default',
      internalRoot: '/default',
      singleFile: null,
    }
    const load = vi
      .fn()
      .mockResolvedValue({ entries: [], knownPaths: { paths: [], assetPaths: [] } })
    const snapshots = new WorkspacePathSnapshotCache({
      getState: () => state,
      load,
      logger: noopLogger,
    })
    const prewarmer = createWorkspaceFileAccessPrewarmer(() => state, snapshots, noopLogger)
    prewarmer.schedule()
    state.rootKind = 'external'
    state.rootPath = '/external'
    await vi.advanceTimersByTimeAsync(75)
    expect(load).toHaveBeenCalledWith(state)
    expect(mocks.sidecar).toHaveBeenCalledWith({
      knowledgeEngineService: undefined,
      logger: noopLogger,
      state,
    })
    prewarmer.dispose()
  })
})
