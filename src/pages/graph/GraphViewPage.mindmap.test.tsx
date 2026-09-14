import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GraphViewPage from '@/pages/GraphViewPage'
import type { GraphData } from '@/logic/graph'
import type { GraphPageProps } from '@/pages/graph/graphPageConfig'

const capture = vi.hoisted(() => vi.fn<(props: GraphPageProps) => void>())
vi.mock('@/pages/GraphPage', () => ({
  default: (props: GraphPageProps) => {
    capture(props)
    return <button onClick={() => props.onContentModeChange?.('full')}>Show body</button>
  },
}))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/pages/useGraphMarkdownEditing', () => ({
  useGraphMarkdownEditing: ({ graph }: { graph: GraphData }) => ({
    editorGraph: graph,
    addChildHeading: vi.fn(),
    addSiblingHeading: vi.fn(),
    addSiblingHeadingBefore: vi.fn(),
    deleteHeading: vi.fn(),
    updateHeadingContent: vi.fn(),
    updateHeadingTitle: vi.fn(),
  }),
}))

const graph: GraphData = {
  nodes: [
    {
      id: 'file:notes.md',
      type: 'file',
      data: { label: 'notes.md' },
      position: { x: 0, y: 0 },
    },
    {
      id: 'heading:root',
      type: 'heading',
      data: { label: 'Topic', level: 1, content: 'Keep this Markdown' },
      position: { x: 100, y: 0 },
    },
  ],
  edges: [
    {
      id: 'contains',
      source: 'file:notes.md',
      target: 'heading:root',
      data: { kind: 'contains' },
    },
  ],
  layoutKey: 'original',
}
const props = {
  graph,
  markdown: '# Topic\n\nKeep this Markdown',
  onOpenFile: vi.fn(),
  onChange: vi.fn(),
  showMiniMap: true,
  contentMode: 'summary' as const,
  editable: false,
  showEmptyMessage: false,
}
const lastPageProps = () => capture.mock.calls.at(-1)![0]

describe('GraphViewPage presentation boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps the workspace graph and configured content mode unchanged by default', async () => {
    render(<GraphViewPage {...props} />)
    await screen.findByRole('button', { name: 'Show body' })
    expect(lastPageProps().presentation).toBe('graph')
    expect(lastPageProps().graph).toBe(graph)
    expect(lastPageProps().contentMode).toBe('summary')
    expect(lastPageProps().editable).toBe(false)
    expect(lastPageProps().showMiniMap).toBe(true)
  })

  it('retains the original full-content behavior for an editable graph presentation', async () => {
    render(<GraphViewPage {...props} presentation="graph" editable />)
    await screen.findByRole('button', { name: 'Show body' })
    expect(lastPageProps().graph).toBe(graph)
    expect(lastPageProps().contentMode).toBe('full')
  })

  it('starts a file mindmap as an editable heading tree without discarding body data', async () => {
    render(<GraphViewPage {...props} presentation="mindmap" editable />)
    await screen.findByRole('button', { name: 'Show body' })
    expect(lastPageProps().contentMode).toBe('none')
    expect(lastPageProps().editable).toBe(true)
    expect(lastPageProps().graph.nodes).toEqual([graph.nodes[1]])
    expect(lastPageProps().graph.nodes[0]).toBe(graph.nodes[1])
    expect(props.onChange).not.toHaveBeenCalled()
  })

  it('switches body presentation without writing Markdown or remounting graph nodes', async () => {
    render(<GraphViewPage {...props} presentation="mindmap" editable />)
    const button = await screen.findByRole('button', { name: 'Show body' })
    const initial = lastPageProps().graph
    fireEvent.click(button)
    expect(lastPageProps().contentMode).toBe('full')
    expect(lastPageProps().graph.nodes[0]).toBe(initial.nodes[0])
    expect(lastPageProps().graph.layoutKey).not.toBe(initial.layoutKey)
    expect(props.onChange).not.toHaveBeenCalled()
  })

  it('does not request a new layout key for a title or body edit', async () => {
    const { rerender } = render(<GraphViewPage {...props} presentation="mindmap" editable />)
    await screen.findByRole('button', { name: 'Show body' })
    const initialKey = lastPageProps().graph.layoutKey
    const editedGraph = {
      ...graph,
      nodes: [
        graph.nodes[0],
        { ...graph.nodes[1], data: { ...graph.nodes[1].data, label: 'Updated title' } },
      ],
      layoutKey: 'source-changed',
    }
    rerender(<GraphViewPage {...props} graph={editedGraph} presentation="mindmap" editable />)
    expect(lastPageProps().graph.layoutKey).toBe(initialKey)
    expect(lastPageProps().graph.nodes[0].data.label).toBe('Updated title')
  })

  it('retains the no-heading file fallback without enabling invalid heading actions', async () => {
    const noHeadings = { nodes: [graph.nodes[0]], edges: [] }
    render(<GraphViewPage {...props} graph={noHeadings} presentation="mindmap" editable />)
    await screen.findByRole('button', { name: 'Show body' })
    expect(lastPageProps().graph.nodes).toBe(noHeadings.nodes)
    expect(lastPageProps().editable).toBe(false)
  })
})
