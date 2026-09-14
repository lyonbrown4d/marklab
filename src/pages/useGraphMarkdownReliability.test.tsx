import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter, Outlet, Route, Routes, useOutletContext } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AppCachedOutlet } from '@/app/AppCachedOutlet'
import type { LayoutContext } from '@/app/AppLayoutContext'
import MarkdownHeadingView from '@/components/markdown/MarkdownHeadingView'
import type { GraphData } from '@/logic/graph'
import { patchGraphHeadingInserted } from '@/logic/graphOptimistic'
import { useGraphMarkdownEditing } from '@/pages/useGraphMarkdownEditing'

const rootId = 'heading:interaction.md:interaction'
const initialMarkdown = '# Interaction\nStart here'
const graph: GraphData = {
  nodes: [
    {
      id: rootId,
      type: 'heading',
      position: { x: 0, y: 0 },
      data: {
        label: 'Interaction',
        path: 'interaction.md',
        line: 1,
        level: 1,
        content: 'Start here',
        contentStartLine: 2,
        contentEndLine: 3,
      },
    },
  ],
  edges: [],
  layoutKey: 'outline:interaction',
}

const GraphProbe = () => {
  const context = useOutletContext<LayoutContext>()
  const { addChildHeading, editorGraph, updateHeadingTitle } = useGraphMarkdownEditing({
    graph: context.graph,
    markdown: context.editorValue,
    onChange: context.onEditorChange,
  })
  return (
    <section tabIndex={0} data-testid="canvas">
      <output data-testid="received-markdown">{context.editorValue}</output>
      <button type="button" onClick={() => addChildHeading(rootId)}>
        Add child
      </button>
      {editorGraph.nodes.map((node) => (
        <div key={node.id} data-testid={node.id === rootId ? 'root-node' : 'new-node'}>
          <MarkdownHeadingView
            blockRole="title"
            level={node.data.level ?? 1}
            text={node.data.label}
            editable
            onCommit={(title) => updateHeadingTitle(node.id, title)}
          />
        </div>
      ))}
    </section>
  )
}

const Shell = ({ cached }: { cached: boolean }) => {
  const [markdown, setMarkdown] = useState(initialMarkdown)
  // Only the graph-route fields are consumed by this focused integration fixture.
  const context = { graph, editorValue: markdown, onEditorChange: setMarkdown } as LayoutContext
  return (
    <>
      <output data-testid="buffer-markdown">{markdown}</output>
      {cached ? (
        <AppCachedOutlet
          context={context}
          routeCacheKey="graph:interaction.md"
          routeCacheMax={3}
          shouldAnimateRouteCache={false}
        />
      ) : (
        <Outlet context={context} />
      )}
    </>
  )
}

const renderGraph = (cached: boolean) =>
  render(
    <MemoryRouter initialEntries={['/graph']}>
      <Routes>
        <Route element={<Shell cached={cached} />}>
          <Route path="graph" element={<GraphProbe />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )

describe('graph Markdown persistence reliability', () => {
  it('rejects a child heading below H6 without changing Markdown or the graph', () => {
    const levelSixGraph: GraphData = {
      ...graph,
      nodes: graph.nodes.map((node) => ({ ...node, data: { ...node.data, level: 6 } })),
    }
    const onChange = vi.fn()
    const { result } = renderHook(() =>
      useGraphMarkdownEditing({
        graph: levelSixGraph,
        markdown: '###### Interaction\nStart here',
        onChange,
      }),
    )
    act(() => {
      expect(result.current.addChildHeading(rootId)).toBeNull()
    })
    expect(onChange).not.toHaveBeenCalled()
    expect(result.current.editorGraph).toBe(levelSixGraph)
  })

  it('still permits a sibling heading at H6', () => {
    const levelSixGraph: GraphData = {
      ...graph,
      nodes: graph.nodes.map((node) => ({ ...node, data: { ...node.data, level: 6 } })),
    }
    const onChange = vi.fn()
    const { result } = renderHook(() =>
      useGraphMarkdownEditing({
        graph: levelSixGraph,
        markdown: '###### Interaction\nStart here',
        onChange,
      }),
    )
    act(() => {
      expect(result.current.addSiblingHeading(rootId)).not.toBeNull()
    })
    expect(onChange).toHaveBeenLastCalledWith('###### Interaction\nStart here\n###### New Topic')
  })

  it('does not overwrite an inserted heading when Markdown props have not caught up', () => {
    const onChange = vi.fn()
    const { result } = renderHook(() =>
      useGraphMarkdownEditing({
        graph,
        markdown: initialMarkdown,
        onChange,
      }),
    )
    let insertedId: string | null = null
    act(() => {
      insertedId = result.current.addChildHeading(rootId)
    })
    expect(onChange).toHaveBeenLastCalledWith(initialMarkdown + '\n## New Topic')
    act(() => result.current.updateHeadingTitle(insertedId!, 'First child'))
    expect(onChange).toHaveBeenLastCalledWith(initialMarkdown + '\n## First child')
  })

  it('retains pending edits when an older outline is delivered as a new graph object', () => {
    const onChange = vi.fn()
    const { result, rerender } = renderHook(
      ({ inputGraph, markdown }) =>
        useGraphMarkdownEditing({ graph: inputGraph, markdown, onChange }),
      { initialProps: { inputGraph: graph, markdown: initialMarkdown } },
    )
    let insertedId: string | null = null
    act(() => {
      insertedId = result.current.addChildHeading(rootId)
    })
    rerender({
      inputGraph: { ...graph, nodes: [...graph.nodes] },
      markdown: initialMarkdown + '\n## New Topic',
    })
    expect(result.current.editorGraph.nodes.some((node) => node.id === insertedId)).toBe(true)
  })

  it('accepts an external undo after the local Markdown was acknowledged', () => {
    const onChange = vi.fn()
    const { result, rerender } = renderHook(
      ({ markdown }) => useGraphMarkdownEditing({ graph, markdown, onChange }),
      { initialProps: { markdown: initialMarkdown } },
    )
    act(() => {
      result.current.addChildHeading(rootId)
    })
    rerender({ markdown: initialMarkdown + '\n## New Topic' })
    rerender({ markdown: initialMarkdown })
    expect(result.current.editorGraph).toBe(graph)
  })

  it('keeps an inserted child when its parent body is edited afterward', () => {
    const onChange = vi.fn()
    const { result } = renderHook(() =>
      useGraphMarkdownEditing({
        graph,
        markdown: initialMarkdown,
        onChange,
      }),
    )
    act(() => {
      result.current.addChildHeading(rootId)
      result.current.updateHeadingContent(rootId, 'Updated body')
    })
    expect(onChange).toHaveBeenLastCalledWith('# Interaction\nUpdated body\n## New Topic')
  })

  it('preserves unrelated node identity when inserting a child', () => {
    const next = patchGraphHeadingInserted(graph, {
      insertLine: 3,
      level: 2,
      nodeId: 'heading:interaction.md:new',
      parentId: rootId,
      targetId: rootId,
      title: 'New Topic',
    })
    expect(next.nodes[0]).toBe(graph.nodes[0])
  })

  it('delivers the latest Markdown to the active cached graph route', async () => {
    renderGraph(true)
    fireEvent.click(screen.getByRole('button', { name: 'Add child' }))
    await waitFor(() =>
      expect(screen.getByTestId('buffer-markdown')).toHaveTextContent('## New Topic'),
    )
    await waitFor(() =>
      expect(screen.getByTestId('received-markdown')).toHaveTextContent('## New Topic'),
    )
  })

  it.each([false, true])(
    'retains an inserted heading after title blur (cached=%s)',
    async (cached) => {
      renderGraph(cached)
      fireEvent.click(screen.getByRole('button', { name: 'Add child' }))
      const node = await screen.findByTestId('new-node')
      const title = node.querySelector<HTMLElement>('[data-markdown-block-role="title"]')
      if (!title) throw new Error('Inserted heading title is missing')
      expect(title).toHaveAttribute('contenteditable', 'plaintext-only')
      act(() => title.focus())
      title.textContent = 'First child'
      fireEvent.input(title)
      act(() => screen.getByTestId('canvas').focus())
      await waitFor(() =>
        expect(screen.getByTestId('buffer-markdown')).toHaveTextContent('## First child'),
      )
      expect(screen.getByTestId('buffer-markdown')).toHaveTextContent('Start here')
    },
  )

  it('does not extend the previous body range over a newly inserted child heading', () => {
    const next = patchGraphHeadingInserted(graph, {
      insertLine: 3,
      level: 2,
      nodeId: 'heading:interaction.md:new',
      parentId: rootId,
      targetId: rootId,
      title: 'New Topic',
    })
    expect(next.nodes.find((node) => node.id === rootId)?.data.contentEndLine).toBe(3)
  })
})
