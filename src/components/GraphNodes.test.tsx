import { ReactFlowProvider } from '@xyflow/react'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  ExternalNode,
  FileNode,
  HeadingNode,
  MissingNode,
  PreviewNode,
} from '@/components/GraphNodes'
import { FULL_HEADING_NODE_MAX_HEIGHT } from '@/logic/graphLayoutMetrics'

vi.mock('@/components/MarkdownBlockSurface', () => ({
  default: ({ blocks }: { blocks: Array<{ id: string }> }) => (
    <div data-testid="markdown-block-surface">{blocks.map((block) => block.id).join(',')}</div>
  ),
}))
vi.mock('@/components/GraphWebNode', () => ({
  GraphWebNode: ({ label }: { label: string }) => <div>{label}</div>,
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

const previewNodeProps = (props: Partial<ComponentProps<typeof PreviewNode>>) =>
  props as ComponentProps<typeof PreviewNode>

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

  it('shows resize controls only for selected rich graph nodes', () => {
    const { container, rerender } = renderGraphNode(
      <ExternalNode
        {...externalNodeProps({
          id: 'ext:https://docs.example.com',
          data: {
            label: 'Docs',
            url: 'https://docs.example.com',
            webView: { active: false, activate: vi.fn(), deactivate: vi.fn() },
          },
          selected: true,
        })}
      />,
    )

    expect(container.querySelectorAll('.react-flow__resize-control')).not.toHaveLength(0)
    const webShell = screen.getByRole('group', { name: 'Docs' })
    const webContent = webShell.querySelector('[data-graph-node-content]')
    expect(webShell).toHaveClass('overflow-visible')
    expect(webContent).toHaveClass('overflow-hidden')
    expect(webContent?.querySelector('.react-flow__resize-control')).toBeNull()

    rerender(
      <ReactFlowProvider>
        <ExternalNode
          {...externalNodeProps({
            id: 'ext:https://docs.example.com',
            data: {
              label: 'Docs',
              url: 'https://docs.example.com',
              webView: { active: false, activate: vi.fn(), deactivate: vi.fn() },
            },
            selected: false,
          })}
        />
      </ReactFlowProvider>,
    )
    expect(container.querySelectorAll('.react-flow__resize-control')).toHaveLength(0)
  })

  it('lets selected file preview nodes resize without adding controls to file cards', () => {
    const { container } = renderGraphNode(
      <PreviewNode
        {...previewNodeProps({
          data: { graphResizable: true, label: 'Guide', target: 'guide.pdf' },
          selected: true,
        })}
      />,
    )

    expect(container.querySelectorAll('.react-flow__resize-control')).not.toHaveLength(0)
    const previewShell = screen.getByRole('group', { name: 'Guide' })
    const previewContent = previewShell.querySelector('[data-graph-node-content]')
    expect(previewShell).toHaveClass('overflow-visible')
    expect(previewContent).toHaveClass('overflow-hidden')
    expect(previewContent?.querySelector('.react-flow__resize-control')).toBeNull()

    const plainPreview = renderGraphNode(
      <PreviewNode
        {...previewNodeProps({
          data: { label: 'Mindmap attachment', target: 'attachment.pdf' },
          selected: true,
        })}
      />,
    )
    expect(plainPreview.container.querySelectorAll('.react-flow__resize-control')).toHaveLength(0)
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
            graphBranch: {
              collapsed: true,
              descendantCount: 3,
              label: 'Expand 3 descendants',
              title: 'Expand branch',
              toggle: toggleFold,
            },
            mindmap: { addChild, addSibling, edit: vi.fn() },
          },
          selected: true,
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add child topic' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add sibling topic' }))
    fireEvent.click(screen.getByRole('button', { name: 'Expand 3 descendants' }))
    expect(addChild).toHaveBeenCalledWith('heading:topic')
    expect(addSibling).toHaveBeenCalledWith('heading:topic')
    expect(toggleFold).toHaveBeenCalledWith('heading:topic')
  })

  it('lets pointer users collapse and expand a graph branch directly from its node', () => {
    const toggle = vi.fn()
    renderGraphNode(
      <FileNode
        {...fileNodeProps({
          id: 'file:notes/current.md',
          data: {
            label: 'current.md',
            graphBranch: {
              collapsed: false,
              descendantCount: 4,
              label: 'Collapse 4 descendants',
              title: 'Collapse branch',
              toggle,
            },
          },
          selected: false,
        })}
      />,
    )

    const disclosure = screen.getByRole('button', { name: 'Collapse 4 descendants' })
    expect(disclosure).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(disclosure)
    expect(toggle).toHaveBeenCalledWith('file:notes/current.md')
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
