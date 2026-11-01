import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KnowledgeGraphDetails } from '@/features/knowledge-graph/KnowledgeGraphDetails'
import { testExternalGraphNode, testGraph } from '@/features/knowledge-graph/testGraph'

vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/components/knowledge/KnowledgeNodePreview', () => ({
  KnowledgeNodePreview: ({
    nodeId,
    revision,
    workspaceKey,
  }: {
    nodeId: string
    revision: string
    workspaceKey: string
  }) => (
    <output data-testid="shared-preview">
      {nodeId}:{revision}:{workspaceKey}
    </output>
  ),
}))

const setup = (index = 0, active = true) => {
  const graph = testGraph()
  const props = {
    graph,
    node: graph.nodes[index],
    workspaceKey: 'workspace',
    active,
    onOpen: vi.fn(),
    onClose: vi.fn(),
    onSelect: vi.fn(),
  }
  return { ...render(<KnowledgeGraphDetails {...props} />), props }
}
beforeEach(() => vi.clearAllMocks())

describe('relation graph details', () => {
  it('shows the website label and URL without mounting a document preview', () => {
    const node = testExternalGraphNode()
    const onOpen = vi.fn()
    render(
      <KnowledgeGraphDetails
        active
        graph={testGraph()}
        node={node}
        workspaceKey="workspace"
        onOpen={onOpen}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByText(node.label)).toBeInTheDocument()
    expect(screen.getByText(node.url)).toBeInTheDocument()
    expect(screen.queryByTestId('shared-preview')).not.toBeInTheDocument()
    expect(onOpen).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'knowledgeGraph.openWebsite' }))
    expect(onOpen).toHaveBeenCalledOnce()
  })
  it('reuses the shared summary and navigates relations independently of document opening', () => {
    const { props } = setup()
    expect(screen.getByTestId('shared-preview')).toHaveTextContent('file:a.md:revision-1:workspace')
    fireEvent.click(screen.getByRole('button', { name: 'Beta' }))
    expect(props.onSelect).toHaveBeenCalledWith('file:b.md')
    expect(props.onOpen).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'knowledgeGraph.open' }))
    expect(props.onOpen).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'knowledgeGraph.clearSelection' }))
    expect(props.onClose).toHaveBeenCalledOnce()
  })
  it('does not mount a preview for hidden or missing nodes and does not offer missing targets for opening', () => {
    const missing = setup(2)
    expect(screen.getByText('knowledgeGraph.missing')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'knowledgeGraph.open' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('shared-preview')).not.toBeInTheDocument()
    missing.unmount()
    setup(0, false)
    expect(screen.queryByTestId('shared-preview')).not.toBeInTheDocument()
  })
})
