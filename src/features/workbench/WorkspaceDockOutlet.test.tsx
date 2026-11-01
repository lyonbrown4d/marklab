import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { LayoutContext } from '@/app/AppLayoutContext'
import type {
  DockTab,
  WorkspaceDockHandle,
  WorkspaceDockProps,
} from '@/features/workbench/dockTypes'
import { WorkspaceDockOutlet } from '@/features/workbench/WorkspaceDockOutlet'
import { registerWorkspaceDock } from '@/features/workbench/workbenchCommands'

const dockState = vi.hoisted<{ tabs: DockTab[]; handle?: WorkspaceDockHandle; restored?: boolean }>(
  () => ({
    tabs: [],
  }),
)
vi.mock('@/features/workbench/WorkspaceDock', async () => {
  const { forwardRef, useImperativeHandle } = await import('react')
  return {
    WorkspaceDock: forwardRef<WorkspaceDockHandle, WorkspaceDockProps>((props, ref) => {
      const handle = dockState.handle
      if (!handle) throw new Error('Missing test dock handle')
      useImperativeHandle(ref, () => handle, [handle])
      return (
        <>
          <button onClick={() => props.onReady?.(handle, { restored: dockState.restored ?? true })}>
            Finish native restore
          </button>
          <button
            onClick={() => {
              const active = handle.getActiveTab()
              if (active) props.onActivate(active)
            }}
          >
            Activate restored pane
          </button>
        </>
      )
    }),
  }
})
vi.mock('@/features/workbench/WorkspaceRoutePanel', () => ({ WorkspaceRoutePanel: () => null }))
vi.mock('@/features/workbench/workbenchCommands', () => ({
  registerWorkspaceDock: vi.fn(() => vi.fn()),
}))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const context: LayoutContext = {
  activePath: 'missing.md',
  editorValue: '',
  editorBufferPath: 'missing.md',
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
  onOpenFile: vi.fn(),
  onOpenFileView: vi.fn(),
  theme: 'paper',
  setTheme: vi.fn(),
  files: [],
  fileContents: {},
  saveStates: {},
  loadingPaths: {},
  currentView: 'wysiwyg',
  activeTab: { kind: 'file', path: 'missing.md', view: 'edit' },
  rootPath: '/workspace',
  rootKind: 'external',
  recentProjects: [],
  showEditorStatusBar: true,
  editorReadOnlyMode: false,
  onCloseActiveTab: vi.fn(),
  onOpenProject: vi.fn(),
  onOpenProjectInCurrentWindow: vi.fn(),
}
const RouteProbe = () => <output data-testid="route">{useLocation().pathname}</output>
const renderOutlet = (layoutContext: LayoutContext = context) =>
  render(
    <MemoryRouter initialEntries={['/files/edit/missing.md']}>
      <WorkspaceDockOutlet
        context={layoutContext}
        workspaceKey="external:/workspace"
        tabs={[{ kind: 'file', view: 'edit', path: 'missing.md' }]}
      />
      <RouteProbe />
    </MemoryRouter>,
  )
beforeEach(() => {
  dockState.restored = true
  vi.clearAllMocks()
  dockState.tabs = []
  dockState.handle = {
    open: vi.fn(),
    activate: vi.fn(),
    reveal: vi.fn(),
    close: vi.fn(),
    getTabs: () => dockState.tabs,
    getActiveTab: () => dockState.tabs[0],
    getGroupId: () => 'saved-group',
  }
})
afterEach(cleanup)

it('keeps an empty or fully pruned native layout empty instead of reopening the stale URL', async () => {
  renderOutlet()
  fireEvent.click(screen.getByRole('button', { name: 'Finish native restore' }))
  await waitFor(() =>
    expect(registerWorkspaceDock).toHaveBeenCalledWith('external:/workspace', dockState.handle),
  )
  expect(dockState.handle?.open).not.toHaveBeenCalled()
  expect(dockState.handle?.activate).not.toHaveBeenCalled()
  expect(screen.getByTestId('route').textContent).toBe('/files/edit/missing.md')
})

it('preserves a surviving native active pane until routing catches up to its restored location', async () => {
  dockState.tabs = [{ id: 'graph', route: '/workspace/graph', title: 'Map', kind: 'graph' }]
  renderOutlet()
  fireEvent.click(screen.getByRole('button', { name: 'Finish native restore' }))
  await waitFor(() => expect(registerWorkspaceDock).toHaveBeenCalled())
  expect(dockState.handle?.open).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Activate restored pane' }))
  await waitFor(() => expect(screen.getByTestId('route').textContent).toBe('/workspace/graph'))
  expect(dockState.handle?.getActiveTab()?.id).toBe('graph')
  expect(dockState.handle?.open).not.toHaveBeenCalled()
  expect(dockState.handle?.activate).not.toHaveBeenCalled()
})

it('waits for a real workspace root before mounting native layout persistence', () => {
  render(
    <MemoryRouter>
      <WorkspaceDockOutlet
        context={{ ...context, rootPath: '', rootKind: 'internal' }}
        workspaceKey="internal:"
        tabs={[]}
      />
    </MemoryRouter>,
  )
  expect(screen.queryByRole('button', { name: 'Finish native restore' })).not.toBeInTheDocument()
  expect(registerWorkspaceDock).not.toHaveBeenCalled()
})

it('lets the current route replace a fresh default placeholder instead of waiting for it to restore', async () => {
  dockState.restored = false
  dockState.tabs = [
    { id: 'placeholder', route: '/', title: 'Open files', kind: 'other' },
    { id: 'document', route: '/files/edit/missing.md', title: 'missing.md', kind: 'document' },
  ]
  renderOutlet()
  fireEvent.click(screen.getByRole('button', { name: 'Finish native restore' }))
  await waitFor(() => expect(dockState.handle?.activate).toHaveBeenCalledWith('document'))
  expect(dockState.handle?.close).toHaveBeenCalledWith('placeholder')
})

it('synchronizes the restored file even when its URL already matches the current route', async () => {
  dockState.tabs = [
    { id: 'restored', route: '/files/edit/missing.md', title: 'missing.md', kind: 'document' },
  ]
  renderOutlet({ ...context, activeTab: { kind: 'file', path: 'Alpha.md', view: 'edit' } })
  fireEvent.click(screen.getByRole('button', { name: 'Finish native restore' }))
  fireEvent.click(screen.getByRole('button', { name: 'Activate restored pane' }))
  await waitFor(() => expect(context.onOpenFileView).toHaveBeenCalledWith('missing.md', 'edit'))
})
