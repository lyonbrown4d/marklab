import type { Node } from '@xyflow/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { GraphHoverPreview } from '@/pages/graph/GraphHoverPreview'
import type { GraphNodeData } from '@/logic/graph'
import type { GraphNodeDetails } from '@/logic/graphViewModel'

const t = (key: string) => key

const node = {
  id: 'heading:docs/brief.md:intro',
  type: 'heading',
  data: {
    label: 'Intro',
    path: 'docs/brief.md',
  },
  position: { x: 0, y: 0 },
} satisfies Node<GraphNodeData>

const details = {
  content: 'A short preview of the selected Markdown heading.',
  incoming: [
    {
      edge: { id: 'file->intro', source: 'file:docs/brief.md', target: node.id },
      node: {
        id: 'file:docs/brief.md',
        type: 'file',
        data: { label: 'brief.md', path: 'docs/brief.md' },
        position: { x: 1, y: 1 },
      },
    },
  ],
  kind: 'heading',
  label: 'Intro',
  node,
  outgoing: [
    {
      edge: { id: 'intro->next', source: node.id, target: 'heading:docs/brief.md:next' },
      node: {
        id: 'heading:docs/brief.md:next',
        type: 'heading',
        data: { label: 'Next', path: 'docs/brief.md' },
        position: { x: 2, y: 2 },
      },
    },
  ],
  path: 'docs/brief.md',
} satisfies GraphNodeDetails

describe('GraphHoverPreview', () => {
  it('does not render without node details or a pointer position', () => {
    const { container, rerender } = render(
      <GraphHoverPreview details={null} position={{ x: 20, y: 30 }} t={t} />,
    )

    expect(container).toBeEmptyDOMElement()

    rerender(<GraphHoverPreview details={details} position={null} t={t} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders a visual-only card preview with graph counts near the pointer', () => {
    render(<GraphHoverPreview details={details} position={{ x: 20, y: 30 }} t={t} />)

    const preview = screen.getByText('Intro').closest('[aria-hidden="true"]')

    expect(preview).toHaveStyle({ transform: 'translate(34px, 44px)' })
    expect(screen.getByText('docs/brief.md')).toBeInTheDocument()
    expect(
      screen.getByText('A short preview of the selected Markdown heading.'),
    ).toBeInTheDocument()
    expect(screen.getByText('graph.kind.heading')).toBeInTheDocument()
    expect(screen.getByText('graph.incoming: 1')).toBeInTheDocument()
    expect(screen.getByText('graph.outgoing: 1')).toBeInTheDocument()
  })
})
