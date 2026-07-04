import type { Edge, Node } from '@xyflow/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GraphInspector } from '@/pages/graph/GraphInspector'
import type { GraphNodeData } from '@/logic/graph'
import type { GraphNodeDetails } from '@/logic/graphViewModel'

vi.mock('@/components/previews/EmbeddedFilePreview', () => ({
  default: ({ target, title }: { target: string; title?: string }) => (
    <div data-testid="embedded-preview" data-target={target}>
      {title}
    </div>
  ),
}))

const t = (key: string) => key

const node = {
  id: 'preview:docs/brief.pdf',
  type: 'preview',
  data: {
    label: 'brief.pdf',
    path: 'docs/brief.pdf',
  },
  position: { x: 0, y: 0 },
} satisfies Node<GraphNodeData>

const previewDetails = {
  incoming: [],
  kind: 'preview',
  label: 'brief.pdf',
  node,
  openPath: 'docs/brief.pdf',
  outgoing: [],
  path: 'docs/brief.pdf',
} satisfies GraphNodeDetails

const createConnection = (index: number) => {
  const connectionNode = {
    id: `file:docs/source-${index}.md`,
    type: 'file',
    data: {
      label: `Source ${index}`,
      path: `docs/source-${index}.md`,
    },
    position: { x: index, y: index },
  } satisfies Node<GraphNodeData>

  const edge = {
    id: `source-${index}->brief`,
    source: connectionNode.id,
    target: node.id,
  } satisfies Edge

  return { edge, node: connectionNode }
}

describe('GraphInspector', () => {
  it('labels the empty inspector panel for assistive technology', () => {
    render(<GraphInspector details={null} onOpenPath={vi.fn()} t={t} />)

    expect(screen.getByRole('complementary', { name: 'graph.inspectorTitle' })).toBeInTheDocument()
    expect(screen.getByText('graph.selectNodeDescription')).toBeInTheDocument()
  })

  it('renders embedded previews for preview graph nodes', () => {
    render(<GraphInspector details={previewDetails} onOpenPath={vi.fn()} t={t} />)

    const embeddedPreview = screen.getByTestId('embedded-preview')

    expect(screen.getByRole('complementary', { name: 'brief.pdf' })).toBeInTheDocument()
    expect(embeddedPreview).toHaveAttribute('data-target', 'docs/brief.pdf')
    expect(embeddedPreview).toHaveTextContent('brief.pdf')
    expect(screen.getByText('graph.kind.preview')).toBeInTheDocument()
  })

  it('opens the selected graph node path from the inspector action', () => {
    const onOpenPath = vi.fn()

    render(<GraphInspector details={previewDetails} onOpenPath={onOpenPath} t={t} />)

    fireEvent.click(screen.getByRole('button', { name: 'graph.openNode' }))

    expect(onOpenPath).toHaveBeenCalledWith('docs/brief.pdf')
  })

  it('summarizes hidden graph connections when the list is clipped', () => {
    render(
      <GraphInspector
        details={{
          ...previewDetails,
          incoming: Array.from({ length: 6 }, (_, index) => createConnection(index + 1)),
        }}
        onOpenPath={vi.fn()}
        t={t}
      />,
    )

    expect(screen.getByText('Source 1')).toBeInTheDocument()
    expect(screen.queryByText('Source 5')).not.toBeInTheDocument()
    expect(screen.getByLabelText('graph.incoming: 6')).toBeInTheDocument()
    expect(screen.getByText('+2')).toBeInTheDocument()
  })
})
