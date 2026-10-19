import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GraphData } from '@/logic/graph'
import WorkspaceGraphPage from '@/pages/WorkspaceGraphPage'
import { graphComputeApi, type GraphCommunity } from '@/services/graphComputeApi'
import {
  clearPendingWorkspaceMapNavigation,
  requestWorkspaceMapNodeFocus,
  workspaceMapNavigationStore,
} from '@/utils/workspaceMapNavigation'

const contextRef = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
vi.mock('@/pages/useLayoutContext', () => ({
  useLayoutContext: (selector: (state: never) => unknown) => selector(contextRef.value as never),
}))
vi.mock('@/services/graphComputeApi', () => ({ graphComputeApi: { communities: vi.fn() } }))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/pages/workspace-map/WorkspaceMapEditorPortal', () => ({
  WorkspaceMapEditorPortalProvider: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('@/pages/workspace-map/WorkspaceMapCanvas', () => ({
  WorkspaceMapCanvas: (props: {
    graph: GraphData
    graphIdentity: string
    searchNodes: GraphData['nodes']
    viewId: string
    onNavigateNode: (id: string) => void
  }) => (
    <div
      data-testid="community-canvas"
      data-view={props.viewId}
      data-workspace={props.graphIdentity}
      data-nodes={JSON.stringify(props.graph.nodes.map(({ id }) => id))}
      data-search-count={props.searchNodes.length}
    >
      <button onClick={() => props.onNavigateNode('file:notes/70.md')}>search result 70</button>
    </div>
  ),
}))

const workspaceKey = 'directory:/workspace'
const makeGraph = (numbers = Array.from({ length: 82 }, (_, index) => index)): GraphData => ({
  nodes: numbers.map((index) => ({
    id: `file:notes/${index}.md`,
    data: { label: `Note ${index}`, path: `notes/${index}.md` },
    type: 'file',
    position: { x: 0, y: 0 },
  })),
  edges: [],
  revision: numbers.join(','),
})
const graph = makeGraph()
const communities: GraphCommunity[] = [
  { id: 'community:a', label: 'Group A', nodeIds: graph.nodes.slice(0, 41).map(({ id }) => id) },
  { id: 'community:b', label: 'Group B', nodeIds: graph.nodes.slice(41).map(({ id }) => id) },
]
const canvasIds = () =>
  JSON.parse(screen.getByTestId('community-canvas').getAttribute('data-nodes')!) as string[]
const expectView = async (viewId: string, ids: string[]) => {
  await waitFor(() => {
    expect(screen.getByTestId('community-canvas')).toHaveAttribute('data-view', viewId)
    expect(canvasIds()).toEqual(ids)
  })
  expect(screen.getAllByTestId('community-canvas')).toHaveLength(1)
  expect(screen.getByTestId('community-canvas')).toHaveAttribute('data-workspace', workspaceKey)
}
const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const content = () => (
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <WorkspaceGraphPage />
      </QueryClientProvider>
    </MemoryRouter>
  )
  const view = render(content())
  return { refresh: () => view.rerender(content()) }
}

beforeEach(() => {
  vi.mocked(graphComputeApi.communities).mockReset().mockResolvedValue({ communities })
  clearPendingWorkspaceMapNavigation()
  contextRef.value = {
    editorReadOnlyMode: false,
    files: graph.nodes.map(({ data }) => ({ kind: 'file', path: data.path })),
    graph,
    rootKind: 'directory',
    rootPath: '/workspace',
    graphEditorPath: null,
    graphLoading: false,
    graphError: null,
    graphMiniMapEnabled: true,
    graphRefreshing: false,
    graphRetry: vi.fn(),
    fileContents: {},
    loadingPaths: {},
    saveStates: {},
    onEditorChange: vi.fn(),
    onOpenFile: vi.fn(),
  }
})

describe('WorkspaceGraphPage community views', () => {
  it('keeps the live graph attached during a content-only workspace revision', async () => {
    const view = renderPage()
    await expectView('community:a', communities[0]!.nodeIds)
    const canvas = screen.getByTestId('community-canvas')
    contextRef.value.graph = { ...graph, revision: 'content-only-save' }
    view.refresh()
    expect(screen.getByTestId('community-canvas')).toBe(canvas)
    expect(graphComputeApi.communities).toHaveBeenCalledOnce()
  })

  it('keeps the selected graph when the active editor is closed', async () => {
    contextRef.value.graphEditorPath = 'notes/0.md'
    const view = renderPage()
    await expectView('community:a', communities[0]!.nodeIds)
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Group B41' }))
    await expectView('community:b', communities[1]!.nodeIds)
    contextRef.value.graphEditorPath = null
    view.refresh()
    await expectView('community:b', communities[1]!.nodeIds)
  })

  it('mounts one default small graph and switches its node set through real tabs and All', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(screen.queryByTestId('community-canvas')).not.toBeInTheDocument()
    await expectView('community:a', communities[0]!.nodeIds)
    expect(screen.getByRole('tab', { name: 'Group A41' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('community-canvas')).toHaveAttribute('data-search-count', '82')

    await user.click(screen.getByRole('tab', { name: 'Group B41' }))
    await expectView('community:b', communities[1]!.nodeIds)
    await user.click(screen.getByRole('tab', { name: 'workspaceMap.allGraph 82' }))
    await expectView(
      'all',
      graph.nodes.map(({ id }) => id),
    )
    expect(graphComputeApi.communities).toHaveBeenCalledOnce()
  })

  it('routes a cross-group search request to its tab before passing the target to Canvas', async () => {
    renderPage()
    await expectView('community:a', communities[0]!.nodeIds)
    fireEvent.click(screen.getByRole('button', { name: 'search result 70' }))
    await expectView('community:b', communities[1]!.nodeIds)
    expect(workspaceMapNavigationStore.getState().request).toEqual({
      nodeId: 'file:notes/70.md',
      viewId: 'community:b',
      workspaceKey,
    })
    act(clearPendingWorkspaceMapNavigation)
    await expectView('community:b', communities[1]!.nodeIds)
  })

  it('selects a history workspace view and locates a legacy node request by membership', async () => {
    renderPage()
    await expectView('community:a', communities[0]!.nodeIds)
    const viewport = { x: 12, y: 24, zoom: 0.8 }
    act(() =>
      requestWorkspaceMapNodeFocus({
        nodeId: 'workspace',
        viewId: 'community:b',
        viewport,
        workspaceKey,
      }),
    )
    await expectView('community:b', communities[1]!.nodeIds)
    expect(workspaceMapNavigationStore.getState().request?.viewport).toEqual(viewport)
    act(clearPendingWorkspaceMapNavigation)
    act(() => requestWorkspaceMapNodeFocus({ nodeId: 'notes/0.md', workspaceKey }))
    await expectView('community:a', communities[0]!.nodeIds)
    expect(workspaceMapNavigationStore.getState().request?.nodeId).toBe('notes/0.md')
    act(clearPendingWorkspaceMapNavigation)
    await expectView('community:a', communities[0]!.nodeIds)
  })

  it('offers retry after community computation fails and renders the recovered graph', async () => {
    vi.mocked(graphComputeApi.communities).mockRejectedValueOnce(new Error('compute failed'))
    renderPage()
    expect(await screen.findByText('workspaceMap.groupingFailed')).toBeInTheDocument()
    expect(screen.queryByTestId('community-canvas')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'workspaceMap.retry' }))
    await expectView('community:a', communities[0]!.nodeIds)
    expect(graphComputeApi.communities).toHaveBeenCalledTimes(2)
  })

  it.each(['workspace', 'notes/70.md'])(
    'removes obsolete community camera or target requests after graph refresh (%s)',
    async (nodeId) => {
      const view = renderPage()
      await expectView('community:a', communities[0]!.nodeIds)
      act(() =>
        requestWorkspaceMapNodeFocus({
          nodeId,
          viewId: 'community:b',
          viewport: { x: 1, y: 2, zoom: 0.8 },
          workspaceKey,
        }),
      )
      await expectView('community:b', communities[1]!.nodeIds)
      const updated = makeGraph([
        ...Array.from({ length: 82 }, (_, i) => i).filter((i) => i !== 70),
        82,
      ])
      const replacement = {
        id: 'community:c',
        label: 'Group C',
        nodeIds: updated.nodes.slice(41).map(({ id }) => id),
      }
      vi.mocked(graphComputeApi.communities).mockResolvedValue({
        communities: [communities[0]!, replacement],
      })
      contextRef.value.graph = updated
      view.refresh()

      await expectView(
        'all',
        updated.nodes.map(({ id }) => id),
      )
      expect(screen.queryByRole('tab', { name: 'Group B41' })).not.toBeInTheDocument()
      if (nodeId === 'workspace') {
        expect(workspaceMapNavigationStore.getState().request).toEqual({
          nodeId,
          viewId: 'all',
          viewport: undefined,
          workspaceKey,
        })
        act(clearPendingWorkspaceMapNavigation)
      } else {
        expect(workspaceMapNavigationStore.getState().request).toBeNull()
      }
      await expectView(
        'all',
        updated.nodes.map(({ id }) => id),
      )
    },
  )
})
