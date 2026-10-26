import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useProjectLoader } from '@/app/useProjectLoader'
import { createFileTab, getWorkspaceTabId } from '@/logic/tabs'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'

const api = vi.hoisted(() => ({
  renamePath: vi.fn(),
  movePath: vi.fn(),
  createFile: vi.fn(),
  createDir: vi.fn(),
  deletePath: vi.fn(),
  setRoot: vi.fn(),
  setSingleFile: vi.fn(),
}))
const treeApi = vi.hoisted(() => ({
  initialFile: vi.fn(),
  listChildren: vi.fn(),
  pathsExist: vi.fn(),
}))
vi.mock('@/services/fsApi', () => ({ fsApi: api }))
vi.mock('@/services/workspaceTreeApi', () => ({ workspaceTreeApi: treeApi }))
vi.mock('@/runtime/environment', () => ({
  runInDesktop: async (work: () => Promise<unknown>) => {
    await work()
  },
}))
vi.mock('@/runtime/dialog', () => ({ openDialog: vi.fn() }))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

type Props = Parameters<typeof useProjectLoader>[0]
const createProps = (overrides: Partial<Props> = {}): Props => ({
  rootPath: '/workspace',
  rootKind: 'internal',
  entries: [
    { kind: 'file', path: 'draft.md' },
    { kind: 'file', path: 'other.md' },
  ],
  tabs: [createFileTab('draft.md'), createFileTab('draft.md', 'source'), createFileTab('other.md')],
  activeTabId: 'file:source:draft.md',
  locationPathname: '/files/source/draft.md',
  preserveCurrentRoute: true,
  defaultFileView: 'edit',
  navigate: vi.fn(),
  setEntries: vi.fn(),
  setRootPath: vi.fn(),
  setRootKind: vi.fn(),
  setTabs: vi.fn(),
  setActiveTabId: vi.fn(),
  touchRecentProject: vi.fn(),
  ...overrides,
})
const snapshot = (paths = ['renamed.md', 'other.md']) => ({
  root: { kind: 'internal' as const, path: '/workspace' },
  entries: paths.map((path) => ({ kind: 'file' as const, path })),
})
const mockTreeProjection = (value = snapshot()) => {
  const resultBase = {
    generation: 0,
    revision: 1,
    root: value.root,
  }
  treeApi.listChildren.mockResolvedValue({
    ...resultBase,
    entries: value.entries.map((entry) => ({ ...entry, hasChildren: false })),
    nextCursor: null,
  })
  treeApi.pathsExist.mockImplementation(({ paths }: { paths: string[] }) =>
    Promise.resolve({
      ...resultBase,
      existing: paths.filter((path) => value.entries.some((entry) => entry.path === path)),
    }),
  )
  treeApi.initialFile.mockResolvedValue({ ...resultBase, path: value.entries[0]?.path ?? null })
}
const deferred = <T = void,>() => {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}
beforeEach(() => {
  vi.resetAllMocks()
  mockTreeProjection()
  api.renamePath.mockResolvedValue(undefined)
  api.movePath.mockResolvedValue(undefined)
})

describe('workspace path mutation navigation', () => {
  it('renames every open view and keeps the active source view', async () => {
    const props = createProps()
    const { result } = renderHook(() => useProjectLoader(props))
    await act(async () => {
      await result.current.renamePath('draft.md', 'renamed.md')
    })
    expect(props.setTabs).toHaveBeenCalledWith([
      createFileTab('renamed.md'),
      createFileTab('renamed.md', 'source'),
      createFileTab('other.md'),
    ])
    expect(props.setActiveTabId).toHaveBeenCalledWith('file:source:renamed.md')
    expect(props.navigate).toHaveBeenCalledWith('/files/source/renamed.md', { replace: true })
  })

  it('remaps directory descendants without changing similarly named siblings', async () => {
    const props = createProps({
      tabs: [createFileTab('docs/note.md'), createFileTab('docs-other/note.md')],
      activeTabId: 'file:edit:docs/note.md',
      locationPathname: '/files/edit/docs/note.md',
    })
    mockTreeProjection(snapshot(['archive/note.md', 'docs-other/note.md']))
    const { result } = renderHook(() => useProjectLoader(props))
    await act(async () => {
      await result.current.renamePath('docs', 'archive')
    })
    expect(props.setTabs).toHaveBeenCalledWith([
      createFileTab('archive/note.md'),
      createFileTab('docs-other/note.md'),
    ])
    expect(props.navigate).toHaveBeenCalledWith('/files/edit/archive/note.md', { replace: true })
  })

  it('keeps the current document when an inactive file is renamed', async () => {
    const props = createProps({
      activeTabId: 'file:edit:other.md',
      locationPathname: '/files/edit/other.md',
    })
    const { result } = renderHook(() => useProjectLoader(props))
    await act(async () => {
      await result.current.renamePath('draft.md', 'renamed.md')
    })
    expect(props.navigate).not.toHaveBeenCalled()
    expect(props.setTabs).toHaveBeenCalled()
  })

  it('does not let an intermediate watcher snapshot remove the renamed tab', async () => {
    const pending = deferred()
    api.renamePath.mockReturnValueOnce(pending.promise)
    const props = createProps()
    const { result } = renderHook(() => useProjectLoader(props))
    const mutation = result.current.renamePath('draft.md', 'renamed.md')
    await act(async () => {
      await result.current.loadWorkspace({ snapshot: snapshot() })
    })
    expect(props.setTabs).not.toHaveBeenCalled()
    await act(async () => {
      pending.resolve()
      await mutation
    })
    expect(props.setActiveTabId).toHaveBeenCalledWith('file:source:renamed.md')
  })

  it('keeps existing tabs on failure and allows a subsequent retry', async () => {
    api.renamePath.mockRejectedValueOnce(new Error('Permission denied'))
    const props = createProps()
    const { result } = renderHook(() => useProjectLoader(props))
    await act(async () => {
      await expect(result.current.renamePath('draft.md', 'renamed.md')).rejects.toThrow(
        'Permission denied',
      )
    })
    expect(props.setTabs).not.toHaveBeenCalled()
    expect(props.navigate).not.toHaveBeenCalled()
    await act(async () => {
      await result.current.renamePath('draft.md', 'renamed.md')
    })
    expect(props.setTabs).toHaveBeenCalled()
  })

  it.each(['result', 'error'] as const)(
    'discards an in-flight watcher %s across rename',
    async (outcome) => {
      const page = deferred<Awaited<ReturnType<typeof treeApi.listChildren>>>()
      const native = deferred()
      treeApi.listChildren.mockReturnValueOnce(page.promise)
      treeApi.initialFile.mockResolvedValueOnce({
        generation: 0,
        revision: 1,
        root: snapshot().root,
        path: null,
      })
      api.renamePath.mockReturnValueOnce(native.promise)
      const props = createProps({
        tabs: [createFileTab('draft.md')],
        activeTabId: 'file:edit:draft.md',
        locationPathname: '/files/edit/draft.md',
      })
      const { result } = renderHook(() => useProjectLoader(props))
      const refresh = result.current.loadWorkspace({ preserveCurrentRoute: true })
      const mutation = result.current.renamePath('draft.md', 'renamed.md')
      if (outcome === 'result')
        await act(async () => {
          page.resolve({
            generation: 0,
            revision: 1,
            root: snapshot().root,
            entries: [],
            nextCursor: null,
          })
          await refresh
        })
      if (outcome === 'result') {
        expect(props.setTabs).not.toHaveBeenCalled()
        expect(props.setEntries).not.toHaveBeenCalled()
        expect(useWorkspaceStore.getState().treeStatus).toBe('ready')
      }
      await act(async () => {
        native.resolve()
        await mutation
      })
      if (outcome === 'error')
        await act(async () => {
          page.reject(new Error('Obsolete tree refresh failed'))
          await expect(refresh).resolves.toBeUndefined()
        })
      expect(api.createFile).not.toHaveBeenCalled()
      expect(useWorkspaceStore.getState().treeStatus).toBe('ready')
      expect(useWorkspaceStore.getState().treeError).toBeNull()
      expect(props.setTabs).toHaveBeenCalledWith([createFileTab('renamed.md')])
      expect(props.navigate).toHaveBeenLastCalledWith('/files/edit/renamed.md', { replace: true })
    },
  )

  it('does not apply old mutation results to another workspace', async () => {
    const pending = deferred()
    api.renamePath.mockReturnValueOnce(pending.promise)
    const props = createProps()
    const { result, rerender } = renderHook((value: Props) => useProjectLoader(value), {
      initialProps: props,
    })
    const mutation = result.current.renamePath('draft.md', 'renamed.md')
    rerender({ ...props, rootPath: '/another' })
    await act(async () => {
      pending.resolve()
      await mutation
    })
    expect(props.setTabs).not.toHaveBeenCalled()
    expect(treeApi.listChildren).not.toHaveBeenCalled()
  })

  it('respects navigation performed while the rename is pending', async () => {
    const pending = deferred()
    api.renamePath.mockReturnValueOnce(pending.promise)
    const props = createProps()
    const { result, rerender } = renderHook((value: Props) => useProjectLoader(value), {
      initialProps: props,
    })
    const mutation = result.current.renamePath('draft.md', 'renamed.md')
    rerender({
      ...props,
      activeTabId: 'file:edit:other.md',
      locationPathname: '/files/edit/other.md',
    })
    await act(async () => {
      pending.resolve()
      await mutation
    })
    expect(props.navigate).not.toHaveBeenCalled()
  })

  it('uses the same navigation handling for moving a file', async () => {
    const props = createProps()
    const { result } = renderHook(() => useProjectLoader(props))
    await act(async () => {
      await result.current.movePath('draft.md', 'renamed.md')
    })
    expect(api.movePath).toHaveBeenCalledWith('draft.md', 'renamed.md')
    expect(props.setActiveTabId).toHaveBeenCalledWith(
      getWorkspaceTabId(createFileTab('renamed.md', 'source')),
    )
  })
})
