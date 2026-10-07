import { act, renderHook } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useProjectLoader } from '@/app/useProjectLoader'
import { openDialog } from '@/runtime/dialog'
import { runInDesktop } from '@/runtime/environment'
import { fsApi } from '@/services/fsApi'
import { workspaceTreeApi } from '@/services/workspaceTreeApi'

const lifecycle = vi.hoisted(() => ({ flushEditorChanges: vi.fn() }))

vi.mock('@/app/editorCloseLifecycle', () => lifecycle)

const messages: Record<string, string> = {
  'projectLoader.openPathFailed': 'Failed to open path',
  'projectLoader.selectFolderFailed': 'Failed to select folder',
}

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}))

vi.mock('@/runtime/dialog', () => ({
  openDialog: vi.fn(),
}))

vi.mock('@/runtime/environment', () => ({
  runInDesktop: vi.fn(),
}))

vi.mock('@/services/fsApi', () => ({
  fsApi: {
    getSnapshot: vi.fn(),
    setRoot: vi.fn(),
    setSingleFile: vi.fn(),
  },
}))

vi.mock('@/services/workspaceTreeApi', () => ({
  workspaceTreeApi: {
    initialFile: vi.fn(),
    listChildren: vi.fn(),
    pathsExist: vi.fn(),
  },
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => messages[key] ?? key,
  }),
}))

const createProps = (overrides: Record<string, unknown> = {}) => ({
  rootPath: 'D:/notes',
  rootKind: 'external',
  entries: [],
  tabs: [],
  activeTabId: null,
  locationPathname: '/',
  preserveCurrentRoute: false,
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

describe('useProjectLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(openDialog).mockReset()
    vi.mocked(runInDesktop).mockReset()
    vi.mocked(runInDesktop).mockImplementation((callback) => Promise.resolve(callback()))
    lifecycle.flushEditorChanges.mockResolvedValue(undefined)
    vi.mocked(fsApi.setRoot).mockResolvedValue({ kind: 'external', path: 'D:/next' })
    vi.mocked(fsApi.setSingleFile).mockResolvedValue({ kind: 'single', path: 'D:/next.md' })
    vi.mocked(fsApi.getSnapshot).mockResolvedValue({
      entries: [{ kind: 'file', path: 'Untitled.md' }],
      root: { kind: 'internal', path: '/app-data/workspace' },
    })
    vi.mocked(workspaceTreeApi.listChildren).mockResolvedValue({
      entries: [{ kind: 'file', name: 'Untitled.md', path: 'Untitled.md', hasChildren: false }],
      nextCursor: null,
      parent: '',
      generation: 1,
      revision: 1,
      root: { kind: 'internal', path: '/app-data/workspace' },
    })
    vi.mocked(workspaceTreeApi.initialFile).mockResolvedValue({
      generation: 1,
      path: 'Untitled.md',
      revision: 1,
      root: { kind: 'internal', path: '/app-data/workspace' },
    })
    vi.mocked(workspaceTreeApi.pathsExist).mockResolvedValue({
      existing: [],
      generation: 1,
      revision: 1,
      root: { kind: 'internal', path: '/app-data/workspace' },
    })
  })

  it('shows localized feedback when opening a desktop path fails', async () => {
    vi.mocked(runInDesktop).mockRejectedValue(new Error('permission denied'))
    const { result } = renderHook(() => useProjectLoader(createProps() as never))

    await act(async () => {
      await result.current.openFolder('D:/locked-note.md')
    })

    expect(toast.error).toHaveBeenCalledWith('Failed to open path', {
      description: 'D:/locked-note.md\npermission denied',
    })
  })

  it('shows localized feedback when folder selection fails', async () => {
    vi.mocked(openDialog).mockRejectedValue(new Error('dialog unavailable'))
    const { result } = renderHook(() => useProjectLoader(createProps() as never))

    await act(async () => {
      await result.current.onSelectFolder()
    })

    expect(toast.error).toHaveBeenCalledWith('Failed to select folder', {
      description: 'dialog unavailable',
    })
  })

  it('reloads the current internal workspace into its active file route', async () => {
    const navigate = vi.fn()
    const setActiveTabId = vi.fn()
    const setTabs = vi.fn()
    const { result } = renderHook(() =>
      useProjectLoader(
        createProps({
          locationPathname: '/files/edit/notes.md',
          navigate,
          rootKind: 'internal',
          rootPath: '/app-data/workspace',
          setActiveTabId,
          setTabs,
        }) as never,
      ),
    )

    await act(async () => {
      await result.current.onUseInternalRoot()
    })

    expect(fsApi.setRoot).not.toHaveBeenCalled()
    expect(setTabs).toHaveBeenCalledWith([{ kind: 'file', path: 'Untitled.md', view: 'edit' }])
    expect(setActiveTabId).toHaveBeenCalledWith('file:edit:Untitled.md')
    expect(navigate).toHaveBeenCalledWith('/files/edit/Untitled.md', { replace: true })
  })

  it('opens the root Home document instead of the first sorted asset without a restorable session', async () => {
    vi.mocked(workspaceTreeApi.listChildren).mockResolvedValue({
      entries: [
        { kind: 'file', name: 'architecture.svg', path: 'architecture.svg', hasChildren: false },
        { kind: 'file', name: 'Home.md', path: 'Home.md', hasChildren: false },
      ],
      nextCursor: null,
      parent: '',
      generation: 1,
      revision: 1,
      root: { kind: 'external', path: 'D:/wiki' },
    })
    vi.mocked(workspaceTreeApi.initialFile).mockResolvedValue({
      generation: 1,
      path: 'Home.md',
      revision: 1,
      root: { kind: 'external', path: 'D:/wiki' },
    })
    const setTabs = vi.fn()
    const setActiveTabId = vi.fn()
    const navigate = vi.fn()
    const { result } = renderHook(() =>
      useProjectLoader(
        createProps({
          navigate,
          setActiveTabId,
          setTabs,
        }) as never,
      ),
    )

    await act(async () => {
      await result.current.loadWorkspace()
    })

    expect(setTabs).toHaveBeenCalledWith([{ kind: 'file', path: 'Home.md', view: 'edit' }])
    expect(setActiveTabId).toHaveBeenCalledWith('file:edit:Home.md')
    expect(navigate).toHaveBeenCalledWith('/files/edit/Home.md', { replace: true })
  })

  it('coalesces repeated internal workspace switches while the IPC call is pending', async () => {
    let resolveSetRoot: (value: { kind: 'internal'; path: string }) => void = () => undefined
    vi.mocked(fsApi.setRoot).mockReturnValue(
      new Promise((resolve) => {
        resolveSetRoot = resolve
      }),
    )
    const { result } = renderHook(() => useProjectLoader(createProps() as never))

    const firstSwitch = result.current.onUseInternalRoot()
    await act(async () => {
      await result.current.onUseInternalRoot()
    })

    expect(fsApi.setRoot).toHaveBeenCalledTimes(1)

    resolveSetRoot({ kind: 'internal', path: '/app-data/workspace' })
    await act(async () => {
      await firstSwitch
    })
  })

  it('loads a bounded root projection without requesting the full snapshot', async () => {
    const setEntries = vi.fn()
    const { result } = renderHook(() => useProjectLoader(createProps({ setEntries }) as never))

    await act(async () => result.current.loadWorkspace())

    expect(workspaceTreeApi.listChildren).toHaveBeenCalledWith({
      cursor: null,
      limit: 256,
      parent: null,
    })
    expect(fsApi.getSnapshot).not.toHaveBeenCalled()
    expect(setEntries).toHaveBeenCalledWith([
      { kind: 'file', path: 'Untitled.md', hasChildren: false },
    ])
  })

  it.each([
    ['folder', 'D:/next', 'setRoot'],
    ['single file', 'D:/next.md', 'setSingleFile'],
  ] as const)('awaits editor flush before switching to a %s', async (_label, path, method) => {
    let finishFlush: (() => void) | undefined
    lifecycle.flushEditorChanges.mockReturnValue(
      new Promise<void>((resolve) => {
        finishFlush = resolve
      }),
    )
    const { result } = renderHook(() => useProjectLoader(createProps() as never))

    const switching = result.current.openFolder(path)
    await vi.waitFor(() => expect(lifecycle.flushEditorChanges).toHaveBeenCalledOnce())
    expect(fsApi[method]).not.toHaveBeenCalled()
    finishFlush?.()
    await act(async () => switching)

    expect(fsApi[method]).toHaveBeenCalled()
  })

  it('does not switch roots after a dirty editor update fails to flush', async () => {
    lifecycle.flushEditorChanges.mockRejectedValue(new Error('Editor buffer update cancelled'))
    const { result } = renderHook(() => useProjectLoader(createProps() as never))

    await act(async () => result.current.openFolder('D:/next'))

    expect(fsApi.setRoot).not.toHaveBeenCalled()
    expect(fsApi.setSingleFile).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Failed to open path', {
      description: 'D:/next\nEditor buffer update cancelled',
    })
  })
})
