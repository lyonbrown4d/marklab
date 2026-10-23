import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { useWorkspaceTreeSearch } from '@/components/file-tree/useWorkspaceTreeSearch'
import { workspaceTreeApi } from '@/services/workspaceTreeApi'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import type { WorkspaceTreeSearchResult } from '@/types/workspaceTree'

const messages = vi.hoisted(() => ({ t: (key: string) => key }))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => messages }))
vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => true }))
vi.mock('@/services/workspaceTreeApi', () => ({ workspaceTreeApi: { search: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

const deferred = () => {
  let resolve: (value: WorkspaceTreeSearchResult) => void = () => {}
  const promise = new Promise<WorkspaceTreeSearchResult>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

const response = (path: string): WorkspaceTreeSearchResult => {
  const state = useWorkspaceStore.getState()
  return {
    root: { kind: state.rootKind, path: state.rootPath },
    generation: state.treeGeneration,
    revision: state.treeRevision,
    entries: [{ kind: 'file', path, name: path, hasChildren: false }],
  }
}

const runDebounce = () => act(() => vi.advanceTimersByTimeAsync(150))

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  useWorkspaceStore.setState({
    rootKind: 'external',
    rootPath: '/first',
    treeGeneration: 1,
    treeRevision: 0,
  })
})

afterEach(() => vi.useRealTimers())

describe('workspace tree search snapshots', () => {
  it('refreshes the same query after a tree change and immediately removes its old result', async () => {
    vi.mocked(workspaceTreeApi.search).mockResolvedValueOnce(response('old-note.md'))
    const { result } = renderHook(() => useWorkspaceTreeSearch(' note '))
    await runDebounce()
    expect(result.current).toEqual([expect.objectContaining({ path: 'old-note.md' })])

    act(() => useWorkspaceStore.setState({ treeRevision: 1 }))
    expect(result.current).toBeNull()
    vi.mocked(workspaceTreeApi.search).mockResolvedValueOnce(response('renamed-note.md'))
    await runDebounce()

    expect(result.current).toEqual([expect.objectContaining({ path: 'renamed-note.md' })])
    expect(workspaceTreeApi.search).toHaveBeenLastCalledWith({ query: 'note' })
  })

  it('hides cached results on a workspace switch without changing the query', async () => {
    vi.mocked(workspaceTreeApi.search).mockResolvedValueOnce(response('first-note.md'))
    const { result } = renderHook(() => useWorkspaceTreeSearch('note'))
    await runDebounce()
    expect(result.current).toEqual([expect.objectContaining({ path: 'first-note.md' })])

    act(() =>
      useWorkspaceStore.setState({ rootKind: 'internal', rootPath: '/second', treeGeneration: 2 }),
    )
    expect(result.current).toBeNull()
    vi.mocked(workspaceTreeApi.search).mockResolvedValueOnce(response('second-note.md'))
    await runDebounce()

    expect(result.current).toEqual([expect.objectContaining({ path: 'second-note.md' })])
  })

  it('rejects a late response from the previous workspace after a newer search completes', async () => {
    const old = deferred()
    const oldResult = response('private-note.md')
    vi.mocked(workspaceTreeApi.search).mockReturnValueOnce(old.promise)
    const { result } = renderHook(() => useWorkspaceTreeSearch('note'))
    await runDebounce()

    act(() => useWorkspaceStore.setState({ rootPath: '/second', treeGeneration: 2 }))
    vi.mocked(workspaceTreeApi.search).mockResolvedValueOnce(response('current-note.md'))
    await runDebounce()
    expect(result.current).toEqual([expect.objectContaining({ path: 'current-note.md' })])

    await act(async () => old.resolve(oldResult))
    expect(result.current).toEqual([expect.objectContaining({ path: 'current-note.md' })])
  })

  it('reports a failed lookup and falls back to the current tree instead of an empty result', async () => {
    vi.mocked(workspaceTreeApi.search).mockRejectedValue(new Error('Search unavailable'))
    const { result } = renderHook(() => useWorkspaceTreeSearch('note'))

    await runDebounce()

    expect(result.current).toBeNull()
    expect(toast.error).toHaveBeenCalledWith('search.failed')
  })

  it('does not report a late failure after the hook unmounts', async () => {
    let reject: (error: Error) => void = () => {}
    vi.mocked(workspaceTreeApi.search).mockReturnValue(
      new Promise((_, fail) => {
        reject = fail
      }),
    )
    const { unmount } = renderHook(() => useWorkspaceTreeSearch('note'))
    await runDebounce()
    unmount()

    await act(async () => reject(new Error('Cancelled owner')))

    expect(toast.error).not.toHaveBeenCalled()
  })
})
