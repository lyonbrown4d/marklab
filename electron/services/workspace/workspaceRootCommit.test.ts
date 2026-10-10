import { describe, expect, it, vi } from 'vitest'

import { runWorkspaceRootCommit } from '@electron/services/workspace/workspaceRootCommit'

const createBuffers = (dirtyCount = 0) => ({
  flush: vi.fn<() => Promise<void>>(async () => undefined),
  getBackgroundDirtyCount: vi.fn(() => dirtyCount),
})

describe('runWorkspaceRootCommit', () => {
  it('flushes before committing a clean workspace transition', async () => {
    const buffers = createBuffers()
    const commit = vi.fn(() => 'committed')

    await expect(runWorkspaceRootCommit({ buffers, commit, options: {} })).resolves.toBe(
      'committed',
    )
    expect(buffers.flush).toHaveBeenCalledOnce()
    expect(commit).toHaveBeenCalledOnce()
  })

  it('does not flush or commit an already-aborted transition', async () => {
    const buffers = createBuffers()
    const commit = vi.fn()
    const controller = new AbortController()
    controller.abort()

    await expect(
      runWorkspaceRootCommit({ buffers, commit, options: { signal: controller.signal } }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(buffers.flush).not.toHaveBeenCalled()
    expect(commit).not.toHaveBeenCalled()
  })

  it('does not inspect or commit state when aborted during the flush', async () => {
    const buffers = createBuffers()
    const controller = new AbortController()
    buffers.flush.mockImplementation(async () => controller.abort())
    const commit = vi.fn()

    await expect(
      runWorkspaceRootCommit({ buffers, commit, options: { signal: controller.signal } }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(buffers.getBackgroundDirtyCount).not.toHaveBeenCalled()
    expect(commit).not.toHaveBeenCalled()
  })

  it('blocks the commit when unsaved buffers remain after flushing', async () => {
    const buffers = createBuffers(2)
    const commit = vi.fn()

    await expect(runWorkspaceRootCommit({ buffers, commit, options: {} })).rejects.toThrow(
      'Workspace switch blocked by 2 unsaved buffer(s)',
    )
    expect(commit).not.toHaveBeenCalled()
  })
})
