import { useEffect } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useWorkspaceRestore } from '@/app/useWorkspaceRestore'
import { useAppLayoutOutlet } from '@/app/useAppLayoutOutlet'
import type { WorkspaceSessionSeedPayload } from '@/runtime/rendererLifecycle'

const seedListeners = vi.hoisted(() => new Set<(payload: WorkspaceSessionSeedPayload) => void>())
const mocks = vi.hoisted(() => ({
  setRoot: vi.fn<(path: string | null) => Promise<void>>(),
  paint: vi.fn<() => Promise<void>>(),
  ready: vi.fn(async () => undefined),
  readLayout: vi.fn(async () => undefined),
}))
vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => true }))
vi.mock('@/runtime/rendererLifecycle', () => ({
  consumeWorkspaceSessionSeed: vi.fn(),
  hasPendingWorkspaceSessionSeed: () => false,
  onWorkspaceSessionSeed: (listener: (payload: WorkspaceSessionSeedPayload) => void) => {
    seedListeners.add(listener)
    return () => seedListeners.delete(listener)
  },
  waitForWorkspaceInteractivePaint: mocks.paint,
}))
vi.mock('@/app/workspaceRestoreReady', () => ({ reportWorkspaceRendererReady: mocks.ready }))
vi.mock('@/app/editorCloseLifecycle', () => ({ flushEditorChanges: vi.fn(async () => undefined) }))
vi.mock('@/services/fsApi', () => ({ fsApi: { setRoot: mocks.setRoot } }))
vi.mock('@/services/workspaceTreeApi', () => ({ workspaceTreeApi: { onChanged: () => vi.fn() } }))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/pages/EditorPaneFallback', () => ({
  default: () => (
    <div data-testid="loading" data-editor-loading="true">
      Loading
    </div>
  ),
}))
vi.mock('@/features/workbench/WorkspaceDockOutlet', () => ({
  WorkspaceDockOutlet: () => {
    useEffect(() => {
      void mocks.readLayout()
    }, [])
    return <div data-testid="dock">Dock</div>
  },
}))

type OutletState = Parameters<typeof useAppLayoutOutlet>[0]['state']
const state: OutletState = {
  activePath: null,
  editorValue: '',
  editorBufferPath: null,
  graph: {
    mode: 'relations',
    topology_key: 'test',
    truncated: false,
    total_nodes: 0,
    total_edges: 0,
    revision: '1',
    nodes: [],
    edges: [],
  },
  graphLoading: false,
  graphError: null,
  graphRetry: async () => undefined,
  graphRefreshing: false,
  onEditorChange: vi.fn(),
  bindDocument: () => vi.fn(),
  flushBuffers: async () => undefined,
  theme: 'paper',
  setTheme: vi.fn(),
  files: [],
  fileContents: {},
  saveStates: {},
  loadingPaths: {},
  viewMode: 'wysiwyg',
  activeTab: null,
  rootPath: '/workspace',
  rootKind: 'external',
  recentProjects: [],
  showEditorStatusBar: true,
  editorReadOnlyMode: false,
  onCloseActiveTab: vi.fn(),
  onCloseTab: vi.fn(),
  onOpenProject: vi.fn(),
  onOpenProjectInCurrentWindow: vi.fn(),
  workspaceKey: 'external:/workspace',
  tabs: [],
  isWorkspaceDataReady: false,
}
const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((next) => {
    resolve = next
  })
  return { promise, resolve }
}
const Harness = ({
  rootPath,
  loadWorkspace,
}: {
  rootPath: string
  loadWorkspace: () => Promise<void>
}) => {
  const restoration = useWorkspaceRestore({
    hasHydrated: true,
    rootPath,
    rootKind: 'external',
    loadWorkspace,
  })
  const { outlet } = useAppLayoutOutlet({
    immersiveZenMode: false,
    onOpenFile: vi.fn(),
    onOpenFileView: vi.fn(),
    state: {
      ...state,
      rootPath,
      workspaceKey: `external:${rootPath}`,
      isWorkspaceDataReady: restoration.isWorkspaceDataReady,
    },
  })
  return (
    <>
      {outlet}
      <output data-testid="restored">{String(restoration.isSessionRestored)}</output>
    </>
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  seedListeners.clear()
  mocks.setRoot.mockResolvedValue(undefined)
  mocks.paint.mockResolvedValue(undefined)
})
afterEach(cleanup)

it('mounts and reads the dock only after backend root and workspace data settle, before interactive paint', async () => {
  const root = deferred()
  const data = deferred()
  const paint = deferred()
  mocks.setRoot.mockReturnValueOnce(root.promise)
  mocks.paint.mockReturnValueOnce(paint.promise)
  const loadWorkspace = vi.fn(() => data.promise)
  const view = render(<Harness rootPath="/persisted" loadWorkspace={loadWorkspace} />)
  await waitFor(() => expect(mocks.setRoot).toHaveBeenCalledWith('/persisted'))
  expect(screen.getByTestId('loading')).toBeDefined()
  expect(mocks.readLayout).not.toHaveBeenCalled()
  expect(loadWorkspace).not.toHaveBeenCalled()
  await act(async () => root.resolve())
  expect(loadWorkspace).toHaveBeenCalledOnce()
  expect(mocks.readLayout).not.toHaveBeenCalled()
  await act(async () => data.resolve())
  await screen.findByTestId('dock')
  expect(mocks.readLayout).toHaveBeenCalledOnce()
  expect(screen.getByTestId('restored').textContent).toBe('false')
  expect(mocks.ready).not.toHaveBeenCalled()
  // A canonical root update while paint is pending must share the completed data operation.
  view.rerender(<Harness rootPath="/canonical" loadWorkspace={loadWorkspace} />)
  expect(mocks.setRoot).toHaveBeenCalledOnce()
  expect(loadWorkspace).toHaveBeenCalledOnce()
  expect(screen.queryByTestId('loading')).toBeNull()
  await act(async () => paint.resolve())
  await waitFor(() => expect(screen.getByTestId('restored').textContent).toBe('true'))
  expect(mocks.ready).toHaveBeenCalledWith({ phase: 'workspace-interactive' })
})

it('invalidates data readiness for a newer seed and ignores the old interactive paint completion', async () => {
  const firstData = deferred()
  const secondData = deferred()
  const oldPaint = deferred()
  mocks.paint.mockReturnValueOnce(oldPaint.promise)
  const loadWorkspace = vi
    .fn<() => Promise<void>>()
    .mockReturnValueOnce(firstData.promise)
    .mockReturnValueOnce(secondData.promise)
  render(<Harness rootPath="/workspace" loadWorkspace={loadWorkspace} />)
  await waitFor(() => expect(loadWorkspace).toHaveBeenCalledOnce())
  await act(async () => firstData.resolve())
  await screen.findByTestId('dock')
  expect(mocks.readLayout).toHaveBeenCalledOnce()
  act(() => {
    for (const listener of seedListeners) {
      listener({ state: { rootKind: 'external', rootPath: '/newer' }, version: 2 })
    }
  })
  await waitFor(() => expect(loadWorkspace).toHaveBeenCalledTimes(2))
  expect(screen.getByTestId('loading')).toBeDefined()
  await act(async () => oldPaint.resolve())
  expect(screen.getByTestId('restored').textContent).toBe('false')
  expect(mocks.ready).not.toHaveBeenCalled()
  expect(mocks.readLayout).toHaveBeenCalledOnce()
  await act(async () => secondData.resolve())
  await screen.findByTestId('dock')
  await waitFor(() => expect(screen.getByTestId('restored').textContent).toBe('true'))
  expect(mocks.readLayout).toHaveBeenCalledTimes(2)
  expect(mocks.ready).toHaveBeenCalledTimes(1)
})
