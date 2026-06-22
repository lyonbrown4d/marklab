import type { Node } from '@xyflow/react'
import { render, screen } from '@testing-library/react'
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

describe('GraphInspector', () => {
  it('renders embedded previews for preview graph nodes', () => {
    render(<GraphInspector details={previewDetails} onOpenPath={vi.fn()} t={t} />)

    const embeddedPreview = screen.getByTestId('embedded-preview')

    expect(embeddedPreview).toHaveAttribute('data-target', 'docs/brief.pdf')
    expect(embeddedPreview).toHaveTextContent('brief.pdf')
    expect(screen.getByText('graph.kind.preview')).toBeInTheDocument()
  })
})
