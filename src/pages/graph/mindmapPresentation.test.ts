import type { Edge, Node } from '@xyflow/react'
import { describe, expect, it } from 'vitest'
import type { GraphData, GraphNodeData } from '@/logic/graph'
import { patchGraphHeadingInserted } from '@/logic/graphOptimistic'
import { createMindmapPresentation } from '@/pages/graph/mindmapPresentation'

const file: Node<GraphNodeData> = {
  id: 'file:notes.md',
  type: 'file',
  position: { x: 0, y: 0 },
  data: { label: 'notes.md', path: 'notes.md' },
}
const heading = (id: string, level: number): Node<GraphNodeData> => ({
  id: `heading:${id}`,
  type: 'heading',
  position: { x: 0, y: 0 },
  data: { label: id, level, path: 'notes.md', content: `Body of ${id}` },
})
const contains = (source: string, target: string): Edge => ({
  id: `${source}->${target}`,
  source,
  target,
  data: { kind: 'contains' },
})
const root = heading('root', 1)
const child = heading('child', 2)
const graph: GraphData = {
  nodes: [file, root, child],
  edges: [contains(file.id, root.id), contains(root.id, child.id)],
  layoutKey: 'source-layout',
}

describe('createMindmapPresentation', () => {
  it.each([
    { kind: 'child', parentId: child.id, level: 3 },
    { kind: 'sibling', parentId: root.id, level: 2 },
  ])('preserves the real optimistic $kind insertion and its parent edge', ({ parentId, level }) => {
    const nodeId = 'heading:inserted'
    const patched = patchGraphHeadingInserted(graph, {
      insertLine: 3,
      level,
      nodeId,
      parentId,
      targetId: child.id,
      title: 'Inserted topic',
    })
    const insertedNode = patched.nodes.find((node) => node.id === nodeId)
    const insertedEdge = patched.edges.find((edge) => edge.target === nodeId)
    const presented = createMindmapPresentation(patched)

    expect(insertedNode).toMatchObject({ id: nodeId, selected: true })
    expect(insertedEdge).toBeDefined()
    expect(presented.nodes).toContain(insertedNode)
    expect(presented.edges).toContain(insertedEdge)
    expect(presented.edges.find((edge) => edge.target === nodeId)).toMatchObject({
      source: parentId,
      target: nodeId,
      data: { kind: 'contains' },
    })
    expect(presented.nodes).not.toContain(file)
  })

  it('removes only the redundant file shell around a single H1 tree', () => {
    const result = createMindmapPresentation(graph)

    expect(result.nodes).toEqual([root, child])
    expect(result.edges).toEqual([graph.edges[1]])
    expect(result.nodes[0]).toBe(root)
    expect(result.nodes[1]).toBe(child)
    expect(result.edges[0]).toBe(graph.edges[1])
    expect(graph.nodes).toEqual([file, root, child])
    expect(graph.edges).toHaveLength(2)
  })

  it('preserves all heading content and block identities', () => {
    const contentBlocks = [
      { id: 'code', kind: 'code', text: 'const x = 1', editable: true },
    ] as const
    const withBody = { ...root, data: { ...root.data, contentBlocks: [...contentBlocks] } }
    const result = createMindmapPresentation({ ...graph, nodes: [file, withBody, child] })

    expect(result.nodes[0].data).toBe(withBody.data)
    expect(result.nodes[0].data.content).toBe(root.data.content)
    expect(result.nodes[0].data.contentBlocks).toBe(withBody.data.contentBlocks)
  })

  it.each([1, 2])('keeps the file shell for multiple heading roots including H%s', (level) => {
    const secondRoot = heading('second', level)
    const result = createMindmapPresentation({
      nodes: [file, root, secondRoot],
      edges: [contains(file.id, root.id), contains(file.id, secondRoot.id)],
    })

    expect(result.nodes).toEqual([file, root, secondRoot])
    expect(result.edges).toHaveLength(2)
  })

  it('keeps a file shell when the only root is not H1', () => {
    const result = createMindmapPresentation({
      nodes: [file, child],
      edges: [contains(file.id, child.id)],
    })
    expect(result.nodes).toEqual([file, child])
  })

  it.each([
    { content: 'Preamble before the first heading' },
    { contentBlocks: [{ id: 'intro', kind: 'paragraph' as const, text: 'Intro', editable: true }] },
  ])('keeps file-level Markdown accessible when the file has a preamble: %j', (data) => {
    const withPreamble = { ...file, data: { ...file.data, ...data } }
    const result = createMindmapPresentation({ ...graph, nodes: [withPreamble, root, child] })
    expect(result.nodes[0]).toBe(withPreamble)
    expect(result.edges).toEqual(graph.edges)
  })

  it('preserves the original fallback when no headings exist', () => {
    const source: GraphData = { nodes: [file], edges: [] }
    const result = createMindmapPresentation(source)
    expect(result.nodes).toBe(source.nodes)
    expect(result.edges).toBe(source.edges)
  })

  it('retains multiple files rather than choosing an arbitrary document root', () => {
    const otherFile = { ...file, id: 'file:other.md' }
    const result = createMindmapPresentation({ ...graph, nodes: [...graph.nodes, otherFile] })
    expect(result.nodes).toEqual([...graph.nodes, otherFile])
  })

  it('hides non-heading relationships without mutating the source graph', () => {
    const link = { ...file, id: 'external:link', type: 'external' }
    const crossLink = { id: 'link', source: root.id, target: child.id }
    const externalLink = { id: 'external', source: child.id, target: link.id }
    const source = {
      nodes: [...graph.nodes, link],
      edges: [...graph.edges, crossLink, externalLink],
    }
    const result = createMindmapPresentation(source)
    expect(result.nodes).toEqual([root, child])
    expect(result.edges).toEqual([graph.edges[1]])
    expect(source.nodes).toContain(link)
    expect(source.edges).toContain(crossLink)
  })

  it('does not relayout for title, body, position or source layout-key changes', () => {
    const edited = {
      ...child,
      position: { x: 100, y: 200 },
      data: { ...child.data, label: 'A much longer title', content: 'Changed Markdown' },
    }
    expect(
      createMindmapPresentation({
        ...graph,
        nodes: [file, root, edited],
        layoutKey: 'changed-source-layout',
      }).layoutKey,
    ).toBe(createMindmapPresentation(graph).layoutKey)
  })

  it('relayouts on structural edits and explicit content mode switches', () => {
    const initial = createMindmapPresentation(graph).layoutKey
    expect(createMindmapPresentation(graph, 'full').layoutKey).not.toBe(initial)
    expect(
      createMindmapPresentation({ nodes: [file, root], edges: [graph.edges[0]] }).layoutKey,
    ).not.toBe(initial)
  })

  it('handles an empty graph', () => {
    const result = createMindmapPresentation({ nodes: [], edges: [] })
    expect(result.nodes).toEqual([])
    expect(result.edges).toEqual([])
  })
})
