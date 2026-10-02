import { ReactFlowProvider } from '@xyflow/react'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ExternalNode, FileNode, HeadingNode, MissingNode } from '@/components/GraphNodes'
import { FULL_HEADING_NODE_MAX_HEIGHT } from '@/logic/graphLayoutMetrics'

vi.mock('@/components/MarkdownBlockSurface', () => ({
  default: ({ blocks }: { blocks: Array<{ id: string }> }) => (
    <div data-testid="markdown-block-surface">{blocks.map((block) => block.id).join(',')}</div>
  ),
}))

const renderGraphNode = (node: ReactNode) => render(<ReactFlowProvider>{node}</ReactFlowProvider>)

const externalNodeProps = (props: Partial<ComponentProps<typeof ExternalNode>>) =>
  props as ComponentProps<typeof ExternalNode>

const fileNodeProps = (props: Partial<ComponentProps<typeof FileNode>>) =>
  props as ComponentProps<typeof FileNode>

const missingNodeProps = (props: Partial<ComponentProps<typeof MissingNode>>) =>
  props as ComponentProps<typeof MissingNode>

const headingNodeProps = (props: Partial<ComponentProps<typeof HeadingNode>>) =>
  props as ComponentProps<typeof HeadingNode>

describe('GraphNodes', () => {
  it('renders file graph nodes with the themed shell instead of React Flow defaults', () => {
    renderGraphNode(
      <FileNode
        {...fileNodeProps({
          data: {
            label: 'current.md',
            subtitle: 'notes/current.md',
            path: 'notes/current.md',
          },
          selected: true,
        })}
      />,
    )

    const node = screen.getByRole('group', { name: 'current.md' })
    expect(node).toHaveAttribute('data-graph-node-kind', 'file')
    expect(node).toHaveAttribute('aria-current', 'true')
    expect(node).toHaveClass('w-[200px]', 'graph-node-shell--file', 'graph-node-shell--selected')
    expect(screen.getByText('notes/current.md')).toHaveClass('truncate', 'text-muted-foreground')
  })

  it('renders external graph nodes with stable layout, metadata, and selected state', () => {
    renderGraphNode(
      <ExternalNode
        {...externalNodeProps({
          data: {
            label: 'Example',
            subtitle: 'docs.example.com',
            url: 'https://docs.example.com/guide',
          },
          selected: true,
        })}
      />,
    )

    const node = screen.getByRole('group', { name: 'Example' })
    expect(node).toHaveAttribute('aria-current', 'true')
    expect(node).toHaveAttribute('aria-roledescription', 'graph node')
    expect(node).toHaveClass('w-[190px]', 'graph-node-shell--selected')

    const subtitle = screen.getByText('docs.example.com')
    expect(subtitle).toHaveClass('truncate', 'text-muted-foreground')
  })

  it('renders missing graph nodes without selected announcement when inactive', () => {
    renderGraphNode(
      <MissingNode
        {...missingNodeProps({
          data: {
            label: 'missing.md',
            subtitle: 'notes/missing.md',
          },
          selected: false,
        })}
      />,
    )

    const node = screen.getByRole('group', { name: 'missing.md' })
    expect(node).not.toHaveAttribute('aria-current')
    expect(node).toHaveClass('w-[190px]', 'graph-node-shell--missing')
    expect(screen.getByText('notes/missing.md')).toHaveClass('truncate')
  })

  it('matches heading graph node width to content density', () => {
    const { rerender } = renderGraphNode(
      <HeadingNode
        {...headingNodeProps({
          id: 'heading:docs/readme.md:intro',
          data: {
            label: 'Intro',
            subtitle: 'H2',
            contentMode: 'none',
          },
          selected: false,
        })}
      />,
    )

    expect(screen.getByRole('group', { name: 'Intro' })).toHaveClass('w-[180px]')
    expect(screen.getByText('H2')).toHaveClass('truncate')

    rerender(
      <ReactFlowProvider>
        <HeadingNode
          {...headingNodeProps({
            id: 'heading:docs/readme.md:intro',
            data: {
              label: 'Intro',
              subtitle: 'H2',
              content: 'Short summary',
              contentMode: 'summary',
            },
            selected: false,
          })}
        />
      </ReactFlowProvider>,
    )

    expect(screen.getByRole('group', { name: 'Intro' })).toHaveClass('w-[240px]')

    rerender(
      <ReactFlowProvider>
        <HeadingNode
          {...headingNodeProps({
            id: 'heading:docs/readme.md:intro',
            data: {
              label: 'Intro',
              subtitle: 'H2',
              content: 'Full content',
              contentMode: 'full',
            },
            selected: false,
          })}
        />
      </ReactFlowProvider>,
    )

    const fullNode = screen.getByRole('group', { name: 'Intro' })
    expect(fullNode).toHaveClass('w-[260px]')
    expect(fullNode).toHaveStyle({
      maxHeight: `${FULL_HEADING_NODE_MAX_HEIGHT}px`,
      overflowY: 'auto',
    })
  })

  it('shows a quiet branch dock only for the selected mindmap topic', () => {
    const addChild = vi.fn()
    const addSibling = vi.fn()
    const toggleFold = vi.fn()
    renderGraphNode(
      <HeadingNode
        {...headingNodeProps({
          id: 'heading:topic',
          data: {
            label: 'Topic',
            contentMode: 'none',
            mindmap: { addChild, addSibling, edit: vi.fn(), hiddenCount: 3, toggleFold },
          },
          selected: true,
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add child topic' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add sibling topic' }))
    fireEvent.click(screen.getByRole('button', { name: 'Show 3 hidden topics' }))
    expect(addChild).toHaveBeenCalledWith('heading:topic')
    expect(addSibling).toHaveBeenCalledWith('heading:topic')
    expect(toggleFold).toHaveBeenCalledWith('heading:topic')
  })

  it('enters title editing on a mindmap topic double click', () => {
    const edit = vi.fn()
    renderGraphNode(
      <HeadingNode
        {...headingNodeProps({
          id: 'heading:topic',
          data: { label: 'Topic', contentMode: 'none', mindmap: { edit } },
          selected: true,
        })}
      />,
    )
    fireEvent.doubleClick(screen.getByRole('group', { name: 'Topic' }))
    expect(edit).toHaveBeenCalledWith('heading:topic')
  })
})
