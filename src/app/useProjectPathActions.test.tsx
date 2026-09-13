import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useProjectLoader } from '@/app/useProjectLoader'
import { createFileTab, getWorkspaceTabId } from '@/logic/tabs'

const api = vi.hoisted(() => ({
  getSnapshot: vi.fn(),
  renamePath: vi.fn(),
  movePath: vi.fn(),
  createFile: vi.fn(),
  createDir: vi.fn(),
  deletePath: vi.fn(),
  setRoot: vi.fn(),
  setSingleFile: vi.fn(),
}))
vi.mock('@/services/fsApi', () => ({ fsApi: api }))
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
const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
beforeEach(() => {
  vi.resetAllMocks()
  api.getSnapshot.mockResolvedValue(snapshot())
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
    api.getSnapshot.mockResolvedValue(snapshot(['archive/note.md', 'docs-other/note.md']))
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
    expect(api.getSnapshot).not.toHaveBeenCalled()
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
