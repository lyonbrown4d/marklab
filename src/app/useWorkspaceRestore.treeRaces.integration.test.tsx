import { useCallback, useState } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { NavigateFunction } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useProjectLoader } from '@/app/useProjectLoader'
import { useWorkspaceRestore } from '@/app/useWorkspaceRestore'
import {
  acceptWorkspaceSessionSeed,
  consumeWorkspaceSessionSeed,
} from '@/runtime/rendererLifecycle'
import { workspaceTreeApi } from '@/services/workspaceTreeApi'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import type {
  WorkspaceTreeChildrenResult,
  WorkspaceTreeDeltaEvent,
  WorkspaceTreeRoot,
} from '@/types/workspaceTree'

const lifecycle = vi.hoisted(() => ({
  paint: vi.fn(async (): Promise<void> => undefined),
  ready: vi.fn(async (): Promise<void> => undefined),
}))
let treeListener: ((event: WorkspaceTreeDeltaEvent) => void) | undefined

vi.mock('@/runtime/rendererLifecycle', async (original) => ({
  ...(await original<typeof import('@/runtime/rendererLifecycle')>()),
  waitForWorkspaceInteractivePaint: lifecycle.paint,
}))
vi.mock('@/app/workspaceRestoreReady', () => ({ reportWorkspaceRendererReady: lifecycle.ready }))
vi.mock('@/runtime/environment', () => ({
  isDesktopRuntime: () => true,
  isTauriRuntime: () => false,
  runInDesktop: async (callback: () => Promise<unknown>) => callback(),
}))
vi.mock('@/app/editorCloseLifecycle', () => ({ flushEditorChanges: vi.fn(async () => undefined) }))
vi.mock('@/services/workspaceTreeApi', () => ({
  workspaceTreeApi: {
    initialFile: vi.fn(),
    listChildren: vi.fn(),
    pathsExist: vi.fn(),
    onChanged: vi.fn((handler: typeof treeListener) => {
      treeListener = handler
      return () => {
        treeListener = undefined
      }
    }),
  },
}))
vi.mock('@/services/fsApi', () => ({
  fsApi: { createFile: vi.fn(), setRoot: vi.fn(), setSingleFile: vi.fn() },
}))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const root: WorkspaceTreeRoot = { kind: 'external', path: '/workspace' }
const seed = { state: { rootKind: root.kind, rootPath: root.path, tabs: [], activeTabId: null } }
const projection = (
  revision: number,
  fileNames = ['PooledNotes.md'],
): WorkspaceTreeChildrenResult => ({
  entries: fileNames.map((path) => ({ kind: 'file', name: path, path, hasChildren: false })),
  generation: 1,
  nextCursor: null,
  parent: '',
  revision,
  root,
})
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((finish) => {
    resolve = finish
  })
  return { promise, resolve }
}
const invalidate = (revision: number, eventRoot = root): void => {
  treeListener?.({
    generation: 1,
    kind: 'invalidated',
    previousRevision: revision - 1,
    revision,
    root: eventRoot,
  })
}

const useRestoreHarness = () => {
  const state = useWorkspaceStore()
  const [route, setRoute] = useState('/')
  const navigate = useCallback((to: string) => setRoute(to), []) as NavigateFunction
  const { loadWorkspace } = useProjectLoader({
    ...state,
    defaultFileView: 'edit',
    locationPathname: route,
    navigate,
    preserveCurrentRoute: false,
  })
  const restore = useWorkspaceRestore({
    hasHydrated: state.hasHydrated,
    loadWorkspace,
    rootKind: state.rootKind,
    rootPath: state.rootPath,
  })
  return { ...restore, loadWorkspace, route }
}

beforeEach(() => {
  vi.clearAllMocks()
  treeListener = undefined
  acceptWorkspaceSessionSeed(seed)
  consumeWorkspaceSessionSeed(seed)
  lifecycle.paint.mockResolvedValue(undefined)
  lifecycle.ready.mockResolvedValue(undefined)
  useWorkspaceStore.setState({
    activeTabId: null,
    entries: [],
    hasHydrated: true,
    loadedTreeParents: [],
    rootKind: root.kind,
    rootPath: root.path,
    tabs: [],
    treeError: null,
    treeGeneration: 0,
    treeNextCursors: {},
    treeRevision: 0,
    treeStatus: 'idle',
  })
  vi.mocked(workspaceTreeApi.listChildren)
    .mockReset()
    .mockResolvedValue(projection(2, ['Fresh.md', 'PooledNotes.md']))
  vi.mocked(workspaceTreeApi.initialFile).mockReset().mockResolvedValue({
    generation: 1,
    path: 'PooledNotes.md',
    revision: 2,
    root,
  })
  vi.mocked(workspaceTreeApi.pathsExist)
    .mockReset()
    .mockResolvedValue({
      existing: ['PooledNotes.md'],
      generation: 1,
      revision: 2,
      root,
    })
})

describe('workspace restoration and tree refresh integration', () => {
  it.each(['seeded', 'default'])(
    'preserves the initial route during %s restoration and refreshes after interactive settlement',
    async (kind) => {
      const initial = deferred<WorkspaceTreeChildrenResult>()
      const paint = deferred<void>()
      vi.mocked(workspaceTreeApi.listChildren).mockReturnValueOnce(initial.promise)
      vi.mocked(workspaceTreeApi.initialFile).mockResolvedValueOnce({
        generation: 1,
        path: 'PooledNotes.md',
        revision: 1,
        root,
      })
      lifecycle.paint.mockReturnValueOnce(paint.promise)
      if (kind === 'seeded') acceptWorkspaceSessionSeed(seed)
      const { result } = renderHook(useRestoreHarness)
      await waitFor(() => expect(workspaceTreeApi.listChildren).toHaveBeenCalledOnce())

      act(() => {
        invalidate(2)
        invalidate(3)
        // An obsolete root's late event must not replace the current root's queue.
        invalidate(3, { ...root, path: '/previous' })
      })
      expect(workspaceTreeApi.listChildren).toHaveBeenCalledOnce()
      expect(result.current.route).toBe('/')
      expect(lifecycle.ready).not.toHaveBeenCalled()

      await act(async () => initial.resolve(projection(1)))
      await waitFor(() => expect(result.current.route).toBe('/files/edit/PooledNotes.md'))
      expect(lifecycle.ready).not.toHaveBeenCalled()
      expect(workspaceTreeApi.listChildren).toHaveBeenCalledOnce()
      await act(async () => paint.resolve())
      await waitFor(() => expect(workspaceTreeApi.listChildren).toHaveBeenCalledTimes(2))
      expect(lifecycle.ready).toHaveBeenCalledExactlyOnceWith({ phase: 'workspace-interactive' })
      expect(lifecycle.ready.mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(workspaceTreeApi.listChildren).mock.invocationCallOrder[1]!,
      )
      await waitFor(() =>
        expect(
          useWorkspaceStore.getState().entries.some((entry) => entry.path === 'Fresh.md'),
        ).toBe(true),
      )
      expect(result.current.route).toBe('/files/edit/PooledNotes.md')
    },
  )

  it('does not refresh a queued root after the restoring renderer unmounts', async () => {
    const initial = deferred<WorkspaceTreeChildrenResult>()
    vi.mocked(workspaceTreeApi.listChildren).mockReturnValueOnce(initial.promise)
    acceptWorkspaceSessionSeed(seed)
    const { unmount } = renderHook(useRestoreHarness)
    await waitFor(() => expect(workspaceTreeApi.listChildren).toHaveBeenCalledOnce())
    act(() => invalidate(2))
    unmount()
    await act(async () => initial.resolve(projection(2)))
    expect(workspaceTreeApi.listChildren).toHaveBeenCalledOnce()
    expect(lifecycle.ready).not.toHaveBeenCalled()
  })

  it('refreshes queued changes after recovery from a failed initial load', async () => {
    vi.mocked(workspaceTreeApi.listChildren).mockRejectedValueOnce(new Error('tree unavailable'))
    acceptWorkspaceSessionSeed(seed)
    const { result } = renderHook(useRestoreHarness)
    await waitFor(() => expect(result.current.restoreFailure?.phase).toBe('session'))
    act(() => invalidate(2))
    expect(workspaceTreeApi.listChildren).toHaveBeenCalledOnce()
    lifecycle.ready.mockClear()
    await act(async () => result.current.loadWorkspace({ preserveCurrentRoute: false }))
    expect(workspaceTreeApi.listChildren).toHaveBeenCalledTimes(2)
    await act(async () => result.current.completeWorkspaceRecovery())
    await waitFor(() => expect(workspaceTreeApi.listChildren).toHaveBeenCalledTimes(3))
    expect(lifecycle.ready).toHaveBeenCalledExactlyOnceWith({ phase: 'workspace-interactive' })
    expect(result.current.isSessionRestored).toBe(true)
  })

  it('flushes only the latest seeded root when an older restore finishes later', async () => {
    const oldInitial = deferred<Awaited<ReturnType<typeof workspaceTreeApi.initialFile>>>()
    const paint = deferred<void>()
    const nextRoot = { ...root, path: '/next' }
    vi.mocked(workspaceTreeApi.listChildren)
      .mockResolvedValueOnce(projection(1))
      .mockResolvedValue({ ...projection(2, ['Next.md']), root: nextRoot })
    vi.mocked(workspaceTreeApi.initialFile)
      .mockReturnValueOnce(oldInitial.promise)
      .mockResolvedValue({ generation: 1, path: 'Next.md', revision: 2, root: nextRoot })
    vi.mocked(workspaceTreeApi.pathsExist).mockResolvedValue({
      existing: ['Next.md'],
      generation: 1,
      revision: 2,
      root: nextRoot,
    })
    lifecycle.paint.mockReturnValueOnce(paint.promise)
    acceptWorkspaceSessionSeed(seed)
    const { result } = renderHook(useRestoreHarness)
    await waitFor(() => expect(workspaceTreeApi.initialFile).toHaveBeenCalledOnce())
    act(() => {
      invalidate(2)
      acceptWorkspaceSessionSeed({ state: { ...seed.state, rootPath: nextRoot.path } })
    })
    await waitFor(() => expect(result.current.route).toBe('/files/edit/Next.md'))
    act(() => {
      invalidate(3, nextRoot)
      invalidate(3)
    })
    await act(async () =>
      oldInitial.resolve({
        generation: 1,
        path: 'PooledNotes.md',
        revision: 1,
        root,
      }),
    )
    expect(result.current.route).toBe('/files/edit/Next.md')
    expect(lifecycle.ready).not.toHaveBeenCalled()
    await act(async () => paint.resolve())
    await waitFor(() => expect(workspaceTreeApi.listChildren).toHaveBeenCalledTimes(3))
    expect(lifecycle.ready).toHaveBeenCalledExactlyOnceWith({ phase: 'workspace-interactive' })
    expect(useWorkspaceStore.getState().rootPath).toBe('/next')
    expect(result.current.route).toBe('/files/edit/Next.md')
  })
})
