import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KnowledgeGraphCanvas } from '@/features/knowledge-graph/KnowledgeGraphCanvas'
import { testGraph } from '@/features/knowledge-graph/testGraph'

const state = vi.hoisted(() => ({
  unavailable: false,
  loading: false,
  fit: vi.fn(),
  arrange: vi.fn(),
  zoom: vi.fn(),
}))
vi.mock('@/features/knowledge-graph/useSigmaGraph', () => ({
  useSigmaGraph: () => ({
    unavailable: state.unavailable,
    renderer: state.loading ? null : { fit: state.fit, zoom: state.zoom, arrange: state.arrange },
  }),
}))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
const renderCanvas = (options = {}) => {
  const props = {
    graph: testGraph(),
    workspaceKey: 'workspace',
    onSelectNode: vi.fn(),
    onOpenNode: vi.fn(),
    ...options,
  }
  return { ...render(<KnowledgeGraphCanvas {...props} />), props }
}
beforeEach(() => {
  vi.clearAllMocks()
  state.unavailable = false
  state.loading = false
})

describe('KnowledgeGraphCanvas', () => {
  it('searches by label and path, selects once and opens only on explicit double click or Enter', () => {
    const { props } = renderCanvas()
    fireEvent.change(screen.getByRole('textbox', { name: 'knowledgeGraph.search' }), {
      target: { value: 'b.md' },
    })
    expect(screen.queryByRole('button', { name: /Alpha/ })).not.toBeInTheDocument()
    const beta = screen.getByRole('button', { name: /Beta/ })
    fireEvent.click(beta)
    expect(props.onSelectNode).toHaveBeenCalledWith('file:b.md')
    expect(props.onOpenNode).not.toHaveBeenCalled()
    fireEvent.doubleClick(beta)
    fireEvent.keyDown(beta, { key: 'Enter' })
    expect(props.onOpenNode).toHaveBeenCalledTimes(2)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'unmatched' } })
    expect(screen.queryByRole('button', { name: /Beta/ })).not.toBeInTheDocument()
  })
  it('provides a keyboard navigable list when WebGL is unavailable', () => {
    state.loading = true
    const loading = renderCanvas()
    expect(screen.getByRole('button', { name: 'knowledgeGraph.arrange' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('knowledgeGraph.loading')
    loading.unmount()
    state.loading = false
    state.unavailable = true
    const { props } = renderCanvas()
    expect(screen.getByText('knowledgeGraph.unavailable')).toBeInTheDocument()
    const alpha = screen.getByRole('button', { name: /Alpha/ })
    alpha.focus()
    fireEvent.keyDown(alpha, { key: 'ArrowDown' })
    expect(screen.getByRole('button', { name: /Beta/ })).toHaveFocus()
    expect(props.onSelectNode).toHaveBeenLastCalledWith('file:b.md')
    fireEvent.keyDown(screen.getByRole('button', { name: /Beta/ }), { key: 'End' })
    expect(screen.getByRole('button', { name: /Missing/ })).toHaveFocus()
  })
  it('bounds list DOM while searching the entire topology', () => {
    state.unavailable = true
    const graph = testGraph()
    graph.nodes = Array.from({ length: 1200 }, (_, index) => ({
      ...graph.nodes[0],
      id: `file:${index}`,
      label: `Document ${index}`,
      path: `${index}.md`,
    }))
    renderCanvas({ graph })
    expect(screen.getAllByRole('listitem')).toHaveLength(100)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '1199.md' } })
    expect(screen.getByRole('button', { name: /Document 1199/ })).toBeInTheDocument()
  })
  it('can restore native positions for manually moved disconnected nodes', () => {
    renderCanvas({ graph: { ...testGraph(), edges: [] } })
    fireEvent.click(screen.getByRole('button', { name: 'knowledgeGraph.arrange' }))
    expect(state.arrange).toHaveBeenCalledOnce()
  })
  it('supports camera controls, clearing selection and reports bounded/truncated topology', () => {
    const { props } = renderCanvas({
      selectedNodeId: 'file:a.md',
      graph: { ...testGraph(), truncated: true },
    })
    fireEvent.click(screen.getByRole('button', { name: 'knowledgeGraph.fit' }))
    fireEvent.click(screen.getByRole('button', { name: 'knowledgeGraph.zoomIn' }))
    fireEvent.click(screen.getByRole('button', { name: 'knowledgeGraph.zoomOut' }))
    expect(state.fit).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'knowledgeGraph.arrange' }))
    expect(state.arrange).toHaveBeenCalledOnce()
    expect(state.zoom).toHaveBeenNthCalledWith(1, 1 / 1.4)
    expect(state.zoom).toHaveBeenNthCalledWith(2, 1.4)
    fireEvent.keyDown(screen.getByRole('region'), { key: 'Enter' })
    expect(props.onOpenNode).toHaveBeenCalledWith('file:a.md')
    fireEvent.click(screen.getByRole('button', { name: 'knowledgeGraph.nodeList' }))
    expect(screen.getByRole('list', { name: 'knowledgeGraph.nodeList' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'knowledgeGraph.clearSelection' }))
    fireEvent.keyDown(screen.getByRole('region'), { key: 'Escape' })
    expect(props.onSelectNode).toHaveBeenLastCalledWith(null)
    expect(screen.getByText('knowledgeGraph.truncated')).toBeInTheDocument()
  })
})
