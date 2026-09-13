import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEditorBufferPersistence, editorBufferIdentity } from '@/app/useEditorBufferState'
import { useEditorBufferStatus } from '@/app/useEditorBufferStatus'

const mocks = vi.hoisted(() => ({
  getBufferStatus: vi.fn(),
  handler: null as ((event: { payload: unknown }) => void) | null,
  unlisten: vi.fn(),
}))
vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => true }))
vi.mock('@/runtime/events', () => ({
  listen: vi.fn(async (_event: string, handler: (event: { payload: unknown }) => void) => {
    mocks.handler = handler
    return mocks.unlisten
  }),
}))
vi.mock('@/services/fsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/fsApi')>()
  return { ...actual, fsApi: { getBufferStatus: mocks.getBufferStatus } }
})

const createHarness = () => {
  const workspace = 'internal:/workspace'
  const path = 'note.md'
  const identity = editorBufferIdentity(workspace, path)
  const snapshot = { identity, path, revision: 1, version: 1, workspace }
  const persistence = createEditorBufferPersistence()
  persistence.setRevision(snapshot)
  const options = {
    changeVersionRef: { current: { [identity]: 1 } },
    latestContentsRef: { current: { [identity]: '# Changed' } },
    markPathClean: vi.fn(),
    markPathDirty: vi.fn(),
    persistence,
    workspaceKeyRef: { current: workspace },
  }
  const hook = renderHook(() => useEditorBufferStatus(options))
  return { ...hook, identity, options, snapshot }
}

beforeEach(() => {
  mocks.handler = null
  mocks.unlisten.mockClear()
  mocks.getBufferStatus.mockReset().mockResolvedValue({
    path: 'note.md',
    revision: 1,
    dirty: false,
  })
})

describe('editor buffer status confirmation', () => {
  it('acknowledges the current saved revision and content from native events', () => {
    const { identity, options } = createHarness()
    act(() => mocks.handler?.({ payload: { path: 'note.md', revision: 1, dirty: false } }))
    expect(options.markPathClean).toHaveBeenCalledWith(
      'internal:/workspace',
      'note.md',
      '# Changed',
    )
    expect(options.persistence.revisionFor(identity)).toBeUndefined()
  })

  it('does not let an old acknowledgement mark newer local content clean', () => {
    const { identity, options } = createHarness()
    options.changeVersionRef.current[identity] = 2
    act(() => mocks.handler?.({ payload: { path: 'note.md', revision: 1, dirty: false } }))
    expect(options.markPathClean).not.toHaveBeenCalled()
    expect(options.persistence.revisionFor(identity)).toBeUndefined()
  })

  it('ignores malformed and mismatched revision events', () => {
    const { options } = createHarness()
    act(() => {
      mocks.handler?.({ payload: null })
      mocks.handler?.({ payload: { path: 'note.md', revision: 2, dirty: false } })
    })
    expect(options.markPathClean).not.toHaveBeenCalled()
    expect(options.markPathDirty).not.toHaveBeenCalled()
  })

  it('confirms a successful explicit flush through the reported buffer revision', async () => {
    const { result, options, snapshot } = createHarness()
    await result.current([snapshot])
    expect(options.markPathClean).toHaveBeenCalledWith(
      'internal:/workspace',
      'note.md',
      '# Changed',
    )
  })

  it('keeps dirty revisions in saving state and propagates status-read failures', async () => {
    const { result, options, snapshot } = createHarness()
    mocks.getBufferStatus.mockResolvedValueOnce({ path: 'note.md', revision: 1, dirty: true })
    await result.current([snapshot])
    expect(options.markPathDirty).toHaveBeenCalledWith('internal:/workspace', 'note.md', {
      status: 'saving',
    })
    const error = new Error('status unavailable')
    mocks.getBufferStatus.mockRejectedValueOnce(error)
    await expect(result.current([snapshot])).rejects.toBe(error)
    expect(options.markPathClean).not.toHaveBeenCalled()
  })

  it('unsubscribes from native status events on unmount', async () => {
    const { unmount } = createHarness()
    await act(async () => {
      await Promise.resolve()
    })
    unmount()
    expect(mocks.unlisten).toHaveBeenCalledTimes(1)
  })
})
