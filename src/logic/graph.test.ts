import { describe, expect, it } from 'vitest'
import { buildGraphFromKnowledgeGraph } from '@/logic/graph'
import type { FsGraph } from '@/services/fsApi'

describe('buildGraphFromKnowledgeGraph', () => {
  it('maps workspace graph nodes to React Flow nodes', () => {
    const graph = buildGraphFromKnowledgeGraph(
      {
        mode: 'mindmap',
        nodes: [
          {
            id: 'file:notes/current.md',
            kind: 'file',
            label: 'current',
            path: 'notes/current.md',
          },
          {
            id: 'heading:notes/current.md:intro',
            kind: 'heading',
            label: 'Intro',
            path: 'notes/current.md',
            line: 1,
            level: 1,
            slug: 'intro',
          },
        ],
        edges: [
          {
            id: 'file:notes/current.md->heading:notes/current.md:intro-0',
            source: 'file:notes/current.md',
            target: 'heading:notes/current.md:intro',
            kind: 'contains',
          },
        ],
      } satisfies FsGraph,
      'full',
    )

    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'file:notes/current.md',
          type: 'file',
        }),
        expect.objectContaining({
          id: 'heading:notes/current.md:intro',
          type: 'heading',
          data: expect.objectContaining({
            label: 'Intro',
            subtitle: 'H1',
            line: 1,
            contentMode: 'full',
          }),
        }),
      ]),
    )
    expect(graph.edges[0]).toMatchObject({ className: 'graph-edge--hierarchy', type: 'smoothstep' })
    expect(graph.nodes.every((node) => node.position.x === 0 && node.position.y === 0)).toBe(true)
  })

  it('preserves backend preview nodes and preview edges', () => {
    const graph = buildGraphFromKnowledgeGraph({
      mode: 'mindmap',
      revision: 'graph-v2',
      nodes: [
        {
          id: 'file:notes/current.md',
          kind: 'file',
          label: 'current',
          path: 'notes/current.md',
        },
        {
          id: 'preview:docs/brief.pdf',
          kind: 'preview',
          label: 'brief.pdf',
          path: 'docs/brief.pdf',
          preview_kind: 'pdf',
          source_path: 'notes/current.md',
          target: 'docs/brief.pdf',
        },
      ],
      edges: [
        {
          id: 'file:notes/current.md->preview:docs/brief.pdf',
          source: 'file:notes/current.md',
          target: 'preview:docs/brief.pdf',
          kind: 'previews',
        },
      ],
    } satisfies FsGraph)

    expect(graph.nodes[1]).toMatchObject({
      id: 'preview:docs/brief.pdf',
      type: 'preview',
      data: {
        path: 'docs/brief.pdf',
        previewKind: 'pdf',
        sourcePath: 'notes/current.md',
        target: 'docs/brief.pdf',
      },
    })
    expect(graph.edges[0]).toMatchObject({
      data: { kind: 'previews' },
      target: 'preview:docs/brief.pdf',
    })
  })

  it('omits heading content from graph nodes when content mode is none', () => {
    const graph = buildGraphFromKnowledgeGraph({
      mode: 'mindmap',
      nodes: [
        {
          id: 'heading:notes/current.md:intro',
          kind: 'heading',
          label: 'Intro',
          path: 'notes/current.md',
          line: 1,
          level: 1,
          slug: 'intro',
          content: 'Long body text',
          content_blocks: [{ id: 'block-1', kind: 'paragraph', text: 'Long body text' }],
          content_start_line: 2,
          content_end_line: 4,
        },
      ],
      edges: [],
    } satisfies FsGraph)

    expect(graph.nodes[0]?.data).toEqual(
      expect.objectContaining({
        content: undefined,
        contentBlocks: undefined,
        contentStartLine: undefined,
        contentEndLine: undefined,
        contentMode: 'none',
      }),
    )
  })

  it('creates the same compact layout key for equivalent knowledge graph structures', () => {
    const graph = buildGraphFromKnowledgeGraph({
      mode: 'mindmap',
      nodes: [
        {
          id: 'file:notes/current.md',
          kind: 'file',
          label: 'current',
          path: 'notes/current.md',
        },
        {
          id: 'heading:notes/current.md:intro',
          kind: 'heading',
          label: 'Intro',
          path: 'notes/current.md',
          level: 1,
          slug: 'intro',
        },
        {
          id: 'heading:notes/current.md:details',
          kind: 'heading',
          label: 'Details',
          path: 'notes/current.md',
          level: 2,
          slug: 'details',
        },
      ],
      edges: [
        {
          id: 'file:notes/current.md->heading:notes/current.md:intro-0',
          source: 'file:notes/current.md',
          target: 'heading:notes/current.md:intro',
          kind: 'contains',
        },
        {
          id: 'heading:notes/current.md:intro->heading:notes/current.md:details-1',
          source: 'heading:notes/current.md:intro',
          target: 'heading:notes/current.md:details',
          kind: 'contains',
        },
      ],
    } satisfies FsGraph)

    const reorderedGraph = buildGraphFromKnowledgeGraph({
      mode: 'mindmap',
      nodes: [...graph.nodes].reverse().map((node) => ({
        id: node.id,
        kind: node.type === 'heading' ? 'heading' : 'file',
        label: node.data.label,
        path: node.data.path,
        level: node.data.level,
        slug: node.data.slug,
      })),
      edges: [...graph.edges].reverse().map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        kind: edge.data?.kind === 'contains' ? 'contains' : 'links_to',
      })),
    } satisfies FsGraph)

    expect(reorderedGraph.layoutKey).toBe(graph.layoutKey)
    expect(graph.layoutKey).not.toContain('heading:notes/current.md:intro')
  })

  it('changes the layout key when knowledge graph structure or mode changes', () => {
    const baseGraph = {
      mode: 'mindmap',
      nodes: [
        {
          id: 'file:notes/current.md',
          kind: 'file',
          label: 'current',
          path: 'notes/current.md',
        },
        {
          id: 'heading:notes/current.md:intro',
          kind: 'heading',
          label: 'Intro',
          path: 'notes/current.md',
          level: 1,
          slug: 'intro',
        },
      ],
      edges: [
        {
          id: 'file:notes/current.md->heading:notes/current.md:intro-0',
          source: 'file:notes/current.md',
          target: 'heading:notes/current.md:intro',
          kind: 'contains',
        },
      ],
    } satisfies FsGraph

    const baseLayoutKey = buildGraphFromKnowledgeGraph(baseGraph).layoutKey
    const nodeLayoutKey = buildGraphFromKnowledgeGraph({
      ...baseGraph,
      nodes: [
        ...baseGraph.nodes,
        {
          id: 'heading:notes/current.md:details',
          kind: 'heading',
          label: 'Details',
          path: 'notes/current.md',
          level: 2,
          slug: 'details',
        },
      ],
    }).layoutKey
    const edgeLayoutKey = buildGraphFromKnowledgeGraph({
      ...baseGraph,
      edges: [
        ...baseGraph.edges,
        {
          id: 'heading:notes/current.md:intro->file:notes/current.md-1',
          source: 'heading:notes/current.md:intro',
          target: 'file:notes/current.md',
          kind: 'links_to',
        },
      ],
    }).layoutKey
    const modeLayoutKey = buildGraphFromKnowledgeGraph({
      ...baseGraph,
      mode: 'graph' as FsGraph['mode'],
    }).layoutKey

    expect(nodeLayoutKey).not.toBe(baseLayoutKey)
    expect(edgeLayoutKey).not.toBe(baseLayoutKey)
    expect(modeLayoutKey).not.toBe(baseLayoutKey)
  })

  it('changes the layout key when heading content changes node layout size', () => {
    const baseGraph = {
      mode: 'mindmap',
      nodes: [
        {
          id: 'heading:notes/current.md:intro',
          kind: 'heading',
          label: 'Intro',
          path: 'notes/current.md',
          level: 1,
          slug: 'intro',
          content: 'One paragraph',
          content_blocks: [{ id: 'p', kind: 'paragraph' as const, text: 'One paragraph' }],
        },
      ],
      edges: [],
    } satisfies FsGraph

    const compactLayoutKey = buildGraphFromKnowledgeGraph(baseGraph, 'none').layoutKey
    const fullLayoutKey = buildGraphFromKnowledgeGraph(baseGraph, 'full').layoutKey

    expect(fullLayoutKey).not.toBe(compactLayoutKey)
  })
})
