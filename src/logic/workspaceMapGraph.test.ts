import { describe, expect, it } from 'vitest'
import type { GraphData } from '@/logic/graph'
import { buildWorkspaceMapGraph } from '@/logic/workspaceMapGraph'

const node = (
  id: string,
  type: string,
  path = id.replace(/^[^:]+:/, ''),
): GraphData['nodes'][number] => ({
  id,
  type,
  data: { label: id, path },
  position: { x: 10, y: 20 },
})

const createGraph = (): GraphData => ({
  nodes: [
    node('file:notes/a.md', 'file', 'notes/a.md'),
    node('file:notes/b.md', 'file', 'notes/b.md'),
    node('heading:notes/a.md:intro', 'heading', 'notes/a.md'),
    node('heading:notes/b.md:topic', 'heading', 'notes/b.md'),
    node('preview:assets/image.png', 'preview', 'assets/image.png'),
    node('missing:notes/missing.md', 'missing', 'notes/missing.md'),
    node('ext:https://example.com', 'external', 'https://example.com'),
  ],
  edges: [
    {
      id: 'heading-reference',
      source: 'file:notes/a.md',
      target: 'heading:notes/b.md:topic',
      data: { kind: 'references_heading', weight: 2 },
    },
  ],
  layoutKey: 'source-layout',
})

describe('buildWorkspaceMapGraph', () => {
  it('folds heading references onto their owning file nodes', () => {
    const result = buildWorkspaceMapGraph(createGraph())

    expect(result.nodes.map(({ id }) => id)).not.toContain('heading:notes/b.md:topic')
    expect(result.edges).toEqual([
      expect.objectContaining({
        source: 'file:notes/a.md',
        target: 'file:notes/b.md',
        type: 'smoothstep',
        data: { kind: 'references_heading', weight: 2 },
      }),
    ])
  })

  it('removes self-loops and unknown endpoints and deduplicates by endpoints and kind', () => {
    const graph = createGraph()
    graph.edges = [
      {
        id: 'self-loop',
        source: 'file:notes/a.md',
        target: 'heading:notes/a.md:intro',
        data: { kind: 'references_heading' },
      },
      graph.edges[0],
      { ...graph.edges[0], id: 'duplicate' },
      { ...graph.edges[0], id: 'different-kind', data: { kind: 'links_to' } },
      { id: 'unknown', source: 'file:notes/a.md', target: 'unknown', data: { kind: 'links_to' } },
    ]

    const result = buildWorkspaceMapGraph(graph)

    expect(result.edges).toHaveLength(2)
    expect(result.edges.map((edge) => edge.data?.kind)).toEqual(['references_heading', 'links_to'])
  })

  it('keeps preview, missing, and external nodes', () => {
    const result = buildWorkspaceMapGraph(createGraph())

    expect(result.nodes.map(({ type }) => type)).toEqual([
      'file',
      'file',
      'preview',
      'missing',
      'external',
    ])
    expect(result.nodes.every((item) => item.data.workspaceMap === true)).toBe(true)
  })

  it('does not mutate or share mutable node and edge data with the input', () => {
    const graph = createGraph()
    const before = structuredClone(graph)

    const result = buildWorkspaceMapGraph(graph)

    expect(graph).toEqual(before)
    expect(result.nodes[0]).not.toBe(graph.nodes[0])
    expect(result.nodes[0].data).not.toBe(graph.nodes[0].data)
    expect(result.edges[0].data).not.toBe(graph.edges[0].data)
  })

  it('has a stable layout key that changes only with mapped structure', () => {
    const graph = createGraph()
    const equivalent = createGraph()
    equivalent.layoutKey = 'unrelated-source-key'
    equivalent.nodes.reverse()
    equivalent.nodes.forEach((item) => {
      item.position = { x: 999, y: 999 }
    })
    equivalent.edges[0] = { ...equivalent.edges[0], id: 'another-id' }

    const base = buildWorkspaceMapGraph(graph)
    const reordered = buildWorkspaceMapGraph(equivalent)
    const changedGraph = createGraph()
    changedGraph.edges.push({
      id: 'preview-link',
      source: 'file:notes/a.md',
      target: 'preview:assets/image.png',
      data: { kind: 'previews' },
    })

    expect(reordered.layoutKey).toBe(base.layoutKey)
    expect(buildWorkspaceMapGraph(changedGraph).layoutKey).not.toBe(base.layoutKey)
  })

  it('returns a stable empty graph', () => {
    const result = buildWorkspaceMapGraph({ nodes: [], edges: [] })

    expect(result).toEqual({
      nodes: [],
      edges: [],
      layoutKey: expect.stringMatching(/^workspace-map:/),
    })
    expect(buildWorkspaceMapGraph({ nodes: [], edges: [] }).layoutKey).toBe(result.layoutKey)
  })
})
