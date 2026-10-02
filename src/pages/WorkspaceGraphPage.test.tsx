import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkspaceGraphPage from '@/pages/WorkspaceGraphPage'

const contextRef = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))

vi.mock('@/pages/useLayoutContext', () => ({
  useLayoutContext: (selector: (state: never) => unknown) => selector(contextRef.value as never),
}))

vi.mock('@/pages/workspace-map/WorkspaceMapCanvas', () => ({
  WorkspaceMapCanvas: (props: {
    activePath: string | null
    editorLoadState: { status: string; content?: string; message?: string }
    graph: { nodes: Array<{ id: string; type?: string }> }
    onActivateEditor: (path: string) => void
    onCloseEditor: () => void
    onRetryEditor: () => void
  }) => (
    <div
      data-testid="map-canvas"
      data-active-path={props.activePath ?? ''}
      data-editor-content={props.editorLoadState.content}
      data-editor-state={props.editorLoadState.status}
    >
      <span>{props.graph.nodes.map((node) => `${node.id}:${node.type}`).join(',')}</span>
      <button onClick={() => props.onActivateEditor('notes/b.md')}>activate b</button>
      <button onClick={props.onCloseEditor}>close map editor</button>
      <button onClick={props.onRetryEditor}>retry editor</button>
    </div>
  ),
}))

vi.mock('@/pages/useDocumentStats', () => ({
  useDocumentStats: (value: string, enabled: boolean) => ({
    characters: enabled ? value.replace(/\s/g, '').length : 0,
    lines: enabled ? value.split('\n').length : 0,
    words: enabled ? value.trim().split(/\s+/).length : 0,
  }),
}))

vi.mock('@/components/EditorDocumentStatus', () => ({
  EditorDocumentStatus: (props: {
    activePath: string
    stats: { lines: number; words: number; characters: number }
    value: string
    viewMode: string
  }) => (
    <output data-testid="document-status">
      {props.activePath}:{props.viewMode}:{props.stats.lines}:{props.stats.words}:
      {props.stats.characters}:{props.value}
    </output>
  ),
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const graph = {
  nodes: [
    {
      id: 'file:notes/a.md',
      type: 'file',
      data: { label: 'a', path: 'notes/a.md' },
      position: { x: 0, y: 0 },
    },
    {
      id: 'heading:a',
      type: 'heading',
      data: { label: 'A', path: 'notes/a.md' },
      position: { x: 0, y: 0 },
    },
  ],
  edges: [],
  layoutKey: 'workspace',
}

const LocationState = () => {
  const location = useLocation()
  return (
    <>
      <output data-testid="search">{location.search}</output>
      <output data-testid="location-state">{JSON.stringify(location.state)}</output>
    </>
  )
}

const renderPage = (entry = '/workspace/graph') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <WorkspaceGraphPage />
      <LocationState />
    </MemoryRouter>,
  )

beforeEach(() => {
  contextRef.value = {
    currentView: 'wysiwyg',
    editorReadOnlyMode: false,
    editorValue: '# A',
    files: [
      { kind: 'file', path: 'notes/a.md' },
      { kind: 'file', path: 'notes/b.md' },
    ],
    graph,
    graphEditorPath: null,
    graphError: null,
    graphLoading: false,
    graphMiniMapEnabled: true,
    graphRefreshing: false,
    graphRetry: vi.fn(),
    fileContents: {},
    loadingPaths: {},
    onEditorChange: vi.fn(),
    onOpenFile: vi.fn(),
    saveStates: {},
    showEditorStatusBar: false,
  }
})

describe('WorkspaceGraphPage', () => {
  it('maps the workspace graph to file-level nodes and updates the edit query', () => {
    renderPage('/workspace/graph?sidebar=graph')

    expect(screen.getByTestId('map-canvas')).toHaveTextContent('file:notes/a.md:file')
    expect(screen.getByTestId('map-canvas')).not.toHaveTextContent('heading:a')
    fireEvent.click(screen.getByRole('button', { name: 'activate b' }))
    expect(screen.getByTestId('search')).toHaveTextContent('sidebar=graph')
    expect(screen.getByTestId('search')).toHaveTextContent('edit=notes%2Fb.md')
  })

  it('renders loading, error with retry, empty, and non-blocking refreshing states', () => {
    contextRef.value.graphLoading = true
    const view = renderPage()
    expect(screen.getByText('workspaceMap.loadingDocument')).toBeInTheDocument()

    contextRef.value.graphLoading = false
    contextRef.value.graphError = new Error('failed')
    contextRef.value.graph = { nodes: [], edges: [] }
    view.rerender(
      <MemoryRouter>
        <WorkspaceGraphPage />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'workspaceMap.retry' }))
    expect(contextRef.value.graphRetry).toHaveBeenCalledOnce()

    contextRef.value.graphError = null
    view.rerender(
      <MemoryRouter>
        <WorkspaceGraphPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('workspaceMap.empty')).toBeInTheDocument()

    contextRef.value.graph = graph
    contextRef.value.graphRefreshing = true
    view.rerender(
      <MemoryRouter>
        <WorkspaceGraphPage />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('map-canvas')).toBeInTheDocument()
    expect(screen.getByText('workspaceMap.refreshing')).toBeInTheDocument()
  })

  it('keeps a retained graph visible when refresh fails and offers retry', () => {
    contextRef.value.graphError = new Error('refresh failed')

    renderPage()

    expect(screen.getByTestId('map-canvas')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('workspaceMap.loadFailed')
    fireEvent.click(screen.getByRole('button', { name: 'workspaceMap.retry' }))
    expect(contextRef.value.graphRetry).toHaveBeenCalledOnce()
  })

  it('does not expose an editor as ready when opening the document failed', () => {
    contextRef.value.graphEditorPath = 'notes/a.md'
    contextRef.value.showEditorStatusBar = true
    contextRef.value.saveStates = {
      'notes/a.md': { status: 'error', message: 'disk unavailable' },
    }

    renderPage('/workspace/graph?edit=notes%2Fa.md')

    expect(screen.getByTestId('map-canvas')).toHaveAttribute('data-editor-state', 'error')
    expect(screen.getByTestId('map-canvas')).not.toHaveAttribute('data-editor-content')
    expect(screen.queryByTestId('document-status')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'retry editor' }))
    expect(screen.getByTestId('location-state')).toHaveTextContent('editorLoadGeneration')
  })

  it('treats a loaded empty document as an editable ready state', () => {
    contextRef.value.graphEditorPath = 'notes/a.md'
    contextRef.value.fileContents = { 'notes/a.md': '' }

    renderPage('/workspace/graph?edit=notes%2Fa.md')

    expect(screen.getByTestId('map-canvas')).toHaveAttribute('data-editor-state', 'ready')
    expect(screen.getByTestId('map-canvas')).toHaveAttribute('data-editor-content', '')
  })

  it('publishes document status only for the active embedded editor path', () => {
    contextRef.value.graphEditorPath = 'notes/a.md'
    contextRef.value.editorValue = 'one two\nthree'
    contextRef.value.fileContents = { 'notes/a.md': 'one two\nthree' }
    contextRef.value.showEditorStatusBar = true

    renderPage('/workspace/graph?edit=notes%2Fa.md')

    expect(screen.getByTestId('document-status')).toHaveTextContent(
      'notes/a.md:wysiwyg:2:3:11:one two three',
    )
  })
})
