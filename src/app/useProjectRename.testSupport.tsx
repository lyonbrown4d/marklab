import { render } from '@testing-library/react'
import { useEffect, useRef, useState } from 'react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { beforeEach, vi } from 'vitest'
import { useProjectLoader } from '@/app/useProjectLoader'
import { useEditorBuffer } from '@/app/useEditorBuffer'
import { resolveEditorLoadState } from '@/app/useEditorBufferState'
import { getWorkspaceTabId } from '@/logic/tabs'
import type { FileEntry, WorkspaceTab } from '@/store/appTypes'
import type { FsBufferSnapshot } from '@/services/fsApi'
import type { WorkspaceTreeDeltaEvent } from '@/types/workspaceTree'

const native = vi.hoisted(() => ({
  createFile: vi.fn(),
  renamePath: vi.fn(),
  openBufferSnapshot: vi.fn(),
  applyBufferUpdate: vi.fn(),
  flushBuffers: vi.fn(),
  getBufferStatus: vi.fn(),
}))
const tree = vi.hoisted(() => ({
  listChildren: vi.fn(),
  initialFile: vi.fn(),
  pathsExist: vi.fn(),
}))
export const listeners = new Set<(event: WorkspaceTreeDeltaEvent) => void>()
vi.mock('@/services/fsApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/fsApi')>()),
  fsApi: native,
}))
vi.mock('@/services/workspaceTreeApi', () => ({
  workspaceTreeApi: {
    ...tree,
    onChanged: (listener: (event: WorkspaceTreeDeltaEvent) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  },
}))
vi.mock('@/runtime/environment', () => ({
  isDesktopRuntime: () => true,
  runInDesktop: (operation: () => Promise<unknown>) => operation(),
}))
vi.mock('@/runtime/events', () => ({ listen: vi.fn(async () => vi.fn()) }))
vi.mock('@/runtime/dialog', () => ({ openDialog: vi.fn() }))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

export const root = { kind: 'external' as const, path: '/empty-workspace' }
export const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}
export let files: Map<string, string>
export let revision: number
export let staleEditorChange: ((content: string) => void) | undefined
export let pendingNewEditorChange: ((content: string) => void) | undefined
export const changed = () => {
  const event: WorkspaceTreeDeltaEvent = {
    root,
    generation: 1,
    revision: ++revision,
    previousRevision: revision - 1,
    kind: 'invalidated',
  }
  for (const listener of listeners) listener(event)
}
const status = (path: string, dirty = false) => ({
  path,
  dirty,
  revision: 1,
  session_generation: 1,
})
const noop = () => undefined
const snapshot = (path: string): FsBufferSnapshot => {
  if (!files.has(path)) throw new Error('No such file or directory (os error 2)')
  return { ...status(path), content: files.get(path)! }
}

const Harness = () => {
  const initialized = useRef(false)
  const location = useLocation()
  const navigate = useNavigate()
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [tabs, setTabs] = useState<WorkspaceTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const activePath = location.pathname.startsWith('/files/edit/')
    ? decodeURIComponent(location.pathname.slice('/files/edit/'.length))
    : null
  const buffer = useEditorBuffer({
    activePath,
    workspaceKey: 'external:/empty-workspace',
    openPaths: tabs.flatMap((tab) => (tab.kind === 'file' ? [tab.path] : [])),
  })
  const loadState = activePath ? resolveEditorLoadState({ ...buffer, path: activePath }) : null
  useEffect(() => {
    if (activePath === 'renamed.md' && buffer.loadingPaths[activePath])
      pendingNewEditorChange = buffer.onEditorChange
  }, [activePath, buffer.loadingPaths, buffer.onEditorChange])
  const { loadWorkspace, renamePath } = useProjectLoader({
    rootKind: root.kind,
    rootPath: root.path,
    entries,
    tabs,
    activeTabId,
    locationPathname: location.pathname,
    preserveCurrentRoute: true,
    defaultFileView: 'edit',
    navigate,
    setEntries,
    setTabs,
    setActiveTabId,
    setRootKind: noop,
    setRootPath: noop,
    touchRecentProject: noop,
    onBeforePathMutation: buffer.beginPathMutation,
  })
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    void loadWorkspace({ tabs: [], activeTabId: null, preserveCurrentRoute: false })
  }, [loadWorkspace])
  useEffect(() => {
    const listener = () => {
      void loadWorkspace({ preserveCurrentRoute: true })
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [loadWorkspace])
  return (
    <>
      <div data-testid="route">{location.pathname}</div>
      <div data-testid="tabs">{tabs.map(getWorkspaceTabId).join(',')}</div>
      <div data-testid="value">{buffer.editorValue}</div>
      <div data-testid="load-state">{loadState?.status}</div>
      <div data-testid="loading">
        {String(Boolean(activePath && buffer.loadingPaths[activePath]))}
      </div>
      <div data-testid="error">
        {error || (activePath && buffer.saveStates[activePath]?.message)}
      </div>
      <button
        onClick={() => {
          staleEditorChange = buffer.onEditorChange
          void renamePath('Untitled.md', 'renamed.md').catch((failure: unknown) =>
            setError(String(failure)),
          )
        }}
      >
        rename
      </button>
      <button
        disabled={buffer.pathMutationPending || loadState?.status !== 'ready'}
        onClick={() => buffer.onEditorChange('unsaved text')}
      >
        edit
      </button>
    </>
  )
}
export const openWorkspace = () =>
  render(
    <MemoryRouter>
      <Harness />
    </MemoryRouter>,
  )
beforeEach(() => {
  vi.resetAllMocks()
  listeners.clear()
  files = new Map()
  revision = 1
  staleEditorChange = undefined
  pendingNewEditorChange = undefined
  const base = () => ({ root, generation: 1, revision })
  tree.listChildren.mockImplementation(async () => ({
    ...base(),
    nextCursor: null,
    entries: [...files.keys()].map((path) => ({ kind: 'file', path, hasChildren: false })),
  }))
  tree.pathsExist.mockImplementation(async ({ paths }: { paths: string[] }) => ({
    ...base(),
    existing: paths.filter((path) => files.has(path)),
  }))
  tree.initialFile.mockImplementation(async () => ({
    ...base(),
    path: [...files.keys()][0] ?? null,
  }))
  native.createFile.mockImplementation(async (path: string) => {
    files.set(path, '')
  })
  native.openBufferSnapshot.mockImplementation(async (path: string) => snapshot(path))
  native.getBufferStatus.mockImplementation(async (path: string) => status(path))
  native.flushBuffers.mockResolvedValue(0)
  native.applyBufferUpdate.mockImplementation(
    async ({
      path,
      update,
    }: {
      path: string
      update: { kind: string; content?: string; changes?: { insert_text: string }[] }
    }) => {
      files.set(path, update.content ?? update.changes?.[0]?.insert_text ?? '')
      return { kind: 'applied', ...status(path, true) }
    },
  )
  native.renamePath.mockImplementation(async (from: string, to: string) => {
    files.set(to, files.get(from)!)
    files.delete(from)
    changed()
  })
})

export { native, tree }
