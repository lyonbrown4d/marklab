import { describe, expect, it } from 'vitest'
import { buildGraphFromRustGraph, buildGraphFromWorkspaceIndex } from '@/logic/graph'
import type { FsGraph, FsWorkspaceIndex } from '@/services/fsApi'

describe('buildGraphFromWorkspaceIndex', () => {
  it('builds file, heading, and normalized link edges from the Rust index shape', () => {
    const graph = buildGraphFromWorkspaceIndex({
      files: [
        {
          path: 'notes/current.md',
          headings: [
            { path: 'notes/current.md', level: 1, text: 'Current', slug: 'current', line: 1 },
          ],
          links: [
            {
              source_path: 'notes/current.md',
              text: 'Details',
              target: 'target.md#details',
              link_type: 'markdown',
              target_path: 'notes/target.md',
              target_anchor: 'details',
              target_heading_slug: 'details',
              is_external: false,
              context: 'See [Details](target.md#details)',
              line: 2,
              column: 5,
            },
          ],
        },
        {
          path: 'notes/target.md',
          headings: [
            { path: 'notes/target.md', level: 2, text: 'Details', slug: 'details', line: 3 },
          ],
          links: [],
        },
      ],
    } satisfies FsWorkspaceIndex)

    expect(graph.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining(['file:notes/current.md', 'heading:notes/target.md:details']),
    )
    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'file:notes/current.md',
          type: 'file',
        }),
      ]),
    )
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'file:notes/current.md',
          target: 'heading:notes/target.md:details',
        }),
      ]),
    )
  })

  it('maps Rust outline graph nodes to React Flow nodes', () => {
    const graph = buildGraphFromRustGraph(
      {
        mode: 'outline',
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
    expect(graph.edges[0]).toEqual(expect.objectContaining({ type: 'smoothstep' }))
  })

  it('omits heading content from graph nodes when content mode is none', () => {
    const graph = buildGraphFromRustGraph({
      mode: 'outline',
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

  it('creates the same compact layout key for equivalent Rust graph structures', () => {
    const graph = buildGraphFromRustGraph({
      mode: 'outline',
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

    const reorderedGraph = buildGraphFromRustGraph({
      mode: 'outline',
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

  it('changes the layout key when Rust graph structure or mode changes', () => {
    const baseGraph = {
      mode: 'outline',
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

    const baseLayoutKey = buildGraphFromRustGraph(baseGraph).layoutKey
    const nodeLayoutKey = buildGraphFromRustGraph({
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
    const edgeLayoutKey = buildGraphFromRustGraph({
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
    const modeLayoutKey = buildGraphFromRustGraph({
      ...baseGraph,
      mode: 'graph' as FsGraph['mode'],
    }).layoutKey

    expect(nodeLayoutKey).not.toBe(baseLayoutKey)
    expect(edgeLayoutKey).not.toBe(baseLayoutKey)
    expect(modeLayoutKey).not.toBe(baseLayoutKey)
  })

  it('changes the layout key when heading content changes node layout size', () => {
    const baseGraph = {
      mode: 'outline',
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

    const compactLayoutKey = buildGraphFromRustGraph(baseGraph, 'none').layoutKey
    const fullLayoutKey = buildGraphFromRustGraph(baseGraph, 'full').layoutKey

    expect(fullLayoutKey).not.toBe(compactLayoutKey)
  })
})
