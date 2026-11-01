import type { ReactNode } from 'react'
import { WorkspacePaneContext } from '@/features/workbench/paneContext'
import { fireEvent, render as testingRender, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkspaceGraphPage from '@/pages/WorkspaceGraphPage'
import { testGraph } from '@/features/knowledge-graph/testGraph'
import { navigationHistoryStore } from '@/features/navigation/navigationHistory'
import {
  requestWorkspaceMapNodeFocus,
  workspaceMapNavigationStore,
} from '@/utils/workspaceMapNavigation'
import type { KnowledgeGraphCanvasProps } from '@/features/knowledge-graph/types'

const state = vi.hoisted(() => ({
  context: {} as Record<string, unknown>,
  active: true,
  openBeside: vi.fn(),
}))
const PaneProvider = ({ children }: { children: ReactNode }) => (
  <WorkspacePaneContext.Provider
    value={{
      id: 'test-pane',
      active: state.active,
      visible: state.active,
      recoveryKey: 0,
      registerFlush: () => () => undefined,
      openFile: vi.fn(),
      openBeside: state.openBeside,
    }}
  >
    {children}
  </WorkspacePaneContext.Provider>
)
const render = (callback: ReactNode) => testingRender(callback, { wrapper: PaneProvider })

vi.mock('@/pages/useLayoutContext', () => ({
  useLayoutContext: (selector: (state: never) => unknown) => selector(state.context as never),
}))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/features/knowledge-graph/KnowledgeGraphCanvas', () => ({
  KnowledgeGraphCanvas: (props: KnowledgeGraphCanvasProps) => (
    <div data-active={props.active} data-testid="canvas">
      <button onClick={() => props.onSelectNode('file:a.md')}>select alpha</button>
      <button onClick={() => props.onOpenNode('file:a.md')}>open alpha</button>
      <button onClick={() => props.onSelectNode('missing:c.md')}>select missing</button>
      <button onClick={() => props.onOpenNode('missing:c.md')}>open missing</button>
      <button onClick={() => props.onFocusConsumed?.()}>consume</button>
      <output>{props.focusRequest?.nodeId}</output>
    </div>
  ),
}))
vi.mock('@/features/knowledge-graph/KnowledgeGraphDetails', () => ({
  KnowledgeGraphDetails: (props: { node: { label: string }; onClose: () => void }) => (
    <aside aria-label="details">
      {props.node.label}
      <button onClick={props.onClose}>close details</button>
    </aside>
  ),
}))

beforeEach(() => {
  state.active = true
  state.openBeside.mockClear()
  state.context = {
    graph: testGraph(),
    rootKind: 'external',
    rootPath: '/workspace',
    graphError: null,
    graphLoading: false,
    graphRefreshing: false,
    graphRetry: vi.fn(),
    onOpenFile: vi.fn(),
  }
  navigationHistoryStore.getState().reset('external:/workspace')
  workspaceMapNavigationStore.setState({ request: null })
})

describe('WorkspaceGraphPage', () => {
  it('keeps selection independent from document editing and refuses to open missing targets', () => {
    render(<WorkspaceGraphPage />)
    fireEvent.click(screen.getByText('select alpha'))
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    expect(state.openBeside).toHaveBeenCalledWith('a.md')
    expect(state.context.onOpenFile).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('open alpha'))
    expect(state.openBeside).toHaveBeenCalledWith('a.md', undefined, true)
    fireEvent.click(screen.getByText('select missing'))
    fireEvent.click(screen.getByText('open missing'))
    expect(screen.getByRole('complementary')).toHaveTextContent('Missing')
    expect(state.context.onOpenFile).not.toHaveBeenCalled()
    expect(state.openBeside).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByText('close details'))
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })
  it('retains graph content through refresh errors, supports retry and represents initial states', () => {
    state.context.graphError = new Error('refresh failed')
    const view = render(<WorkspaceGraphPage />)
    expect(screen.getByTestId('canvas')).toBeInTheDocument()
    fireEvent.click(screen.getByText('knowledgeGraph.retry'))
    expect(state.context.graphRetry).toHaveBeenCalledOnce()
    state.context.graph = { ...testGraph(), nodes: [], edges: [] }
    state.context.graphError = null
    state.context.graphLoading = true
    view.rerender(<WorkspaceGraphPage />)
    expect(screen.getByRole('status')).toHaveTextContent('knowledgeGraph.loading')
    state.context.graphLoading = false
    view.rerender(<WorkspaceGraphPage />)
    expect(screen.getByRole('status')).toHaveTextContent('knowledgeGraph.empty')
    state.context.graphError = new Error('initial failed')
    view.rerender(<WorkspaceGraphPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('knowledgeGraph.loadFailed')
  })
  it('reports an absent target after a bounded graph finishes refreshing and can dismiss the request', () => {
    state.context.graph = { ...testGraph(), truncated: true, total_nodes: 20_000 }
    state.context.graphRefreshing = true
    const pending = { workspaceKey: 'external:/workspace', nodeId: 'file:outside-limit.md' }
    requestWorkspaceMapNodeFocus(pending)
    const view = render(<WorkspaceGraphPage />)
    expect(screen.queryByText('knowledgeGraph.targetUnavailable')).not.toBeInTheDocument()
    state.context.graphRefreshing = false
    view.rerender(<WorkspaceGraphPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('knowledgeGraph.targetUnavailable')
    expect(workspaceMapNavigationStore.getState().request).toBe(pending)
    expect(screen.queryByText('file:outside-limit.md')).not.toBeInTheDocument()
    expect(state.context.onOpenFile).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'knowledgeGraph.close' }))
    expect(workspaceMapNavigationStore.getState().request).toBeNull()
    expect(screen.queryByText('knowledgeGraph.targetUnavailable')).not.toBeInTheDocument()
  })
  it('consumes only matching workspace focus requests and discards stale workspace selection', () => {
    requestWorkspaceMapNodeFocus({
      workspaceKey: 'external:/workspace',
      nodeId: 'file:b.md',
      viewport: { x: 0.2, y: 0.4, ratio: 0.8, angle: 0 },
    })
    const view = render(<WorkspaceGraphPage />)
    expect(screen.getByText('file:b.md')).toBeInTheDocument()
    fireEvent.click(screen.getByText('consume'))
    expect(workspaceMapNavigationStore.getState().request).toBeNull()
    fireEvent.click(screen.getByText('select alpha'))
    state.context.rootPath = '/other'
    view.rerender(<WorkspaceGraphPage />)
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    state.active = false
    view.rerender(<WorkspaceGraphPage />)
    expect(screen.getByTestId('canvas')).toHaveAttribute('data-active', 'false')
  })
})
