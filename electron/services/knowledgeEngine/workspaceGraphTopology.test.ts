import { describe, expect, it } from 'vitest'

import {
  graphTopologyOnly,
  isGraphTopologyOnly,
} from '@electron/services/knowledgeEngine/workspaceGraphTopology'
import type { FsGraph } from '@electron/services/workspace/types'

describe('workspace graph topology', () => {
  it('collapses heading endpoints into their file and returns only lightweight nodes', () => {
    const graph: FsGraph = {
      mode: 'mindmap',
      revision: 'revision-1',
      nodes: [
        {
          id: 'file:a.md',
          kind: 'file',
          label: 'A',
          path: 'a.md',
          content: 'private body',
          content_blocks: [{ id: 'body', kind: 'paragraph', text: 'private body' }],
          content_start_line: 1,
          content_end_line: 3,
          group: { key: 'group:a', label: 'A', source: 'semantic' },
        },
        { id: 'file:b.md', kind: 'file', label: 'B', path: 'b.md' },
        {
          id: 'heading:b.md:details',
          kind: 'heading',
          label: 'Details',
          path: 'b.md',
          line: 4,
          level: 2,
          slug: 'details',
        },
        { id: 'missing:later.md', kind: 'missing', label: 'Later', path: 'later.md' },
        { id: 'ext:https://example.com', kind: 'external', label: 'Example' },
        {
          id: 'preview:assets/map.png',
          kind: 'preview',
          label: 'map.png',
          path: 'assets/map.png',
          preview_kind: 'image',
          source_path: 'a.md',
          target: 'assets/map.png',
        },
      ],
      edges: [
        {
          id: 'contains-heading',
          kind: 'contains',
          source: 'file:b.md',
          target: 'heading:b.md:details',
        },
        {
          id: 'z-heading-reference',
          kind: 'references_heading',
          source: 'file:a.md',
          target: 'heading:b.md:details',
        },
        {
          id: 'a-heading-reference',
          kind: 'references_heading',
          source: 'file:a.md',
          target: 'heading:b.md:details',
        },
        {
          id: 'heading-to-missing',
          kind: 'links_to',
          source: 'heading:b.md:details',
          target: 'missing:later.md',
        },
        {
          id: 'preview-edge',
          kind: 'previews',
          source: 'file:a.md',
          target: 'preview:assets/map.png',
        },
      ],
    }

    const result = graphTopologyOnly(graph)

    expect(result.revision).toBe('revision-1')
    expect(result.nodes.map((node) => node.kind)).toEqual([
      'file',
      'file',
      'missing',
      'external',
      'preview',
    ])
    expect(result.nodes[0]?.group).toEqual({ key: 'group:a', label: 'A', source: 'semantic' })
    expect(result.nodes[0]).not.toHaveProperty('content')
    expect(result.nodes[0]).not.toHaveProperty('content_blocks')
    expect(result.nodes[0]).not.toHaveProperty('content_start_line')
    expect(result.nodes[0]).not.toHaveProperty('content_end_line')
    expect(result.nodes.at(-1)).toMatchObject({
      preview_kind: 'image',
      source_path: 'a.md',
      target: 'assets/map.png',
    })
    expect(result.edges).toEqual([
      {
        id: 'preview-edge',
        kind: 'previews',
        source: 'file:a.md',
        target: 'preview:assets/map.png',
      },
      {
        id: 'a-heading-reference',
        kind: 'references_heading',
        source: 'file:a.md',
        target: 'file:b.md',
      },
      {
        id: 'heading-to-missing',
        kind: 'links_to',
        source: 'file:b.md',
        target: 'missing:later.md',
      },
    ])
  })

  it('resolves a legacy heading from its path when the contains edge is missing', () => {
    const result = graphTopologyOnly({
      mode: 'mindmap',
      nodes: [
        { id: 'file:a.md', kind: 'file', label: 'A', path: 'a.md' },
        {
          id: 'heading:a.md:intro',
          kind: 'heading',
          label: 'Intro',
          path: 'a.md',
        },
        { id: 'ext:https://example.com', kind: 'external', label: 'Example' },
      ],
      edges: [
        {
          id: 'heading-link',
          kind: 'links_to',
          source: 'heading:a.md:intro',
          target: 'ext:https://example.com',
        },
      ],
    })

    expect(result.edges[0]).toMatchObject({
      source: 'ext:https://example.com',
      target: 'file:a.md',
    })
  })

  it('deterministically coalesces reciprocal and cross-kind file connections', () => {
    const graph: FsGraph = {
      mode: 'mindmap',
      nodes: [
        { id: 'file:a.md', kind: 'file', label: 'A', path: 'a.md' },
        { id: 'file:b.md', kind: 'file', label: 'B', path: 'b.md' },
        { id: 'heading:b.md:intro', kind: 'heading', label: 'Intro', path: 'b.md' },
      ],
      edges: [
        {
          id: 'z-plain-link',
          kind: 'links_to',
          source: 'file:a.md',
          target: 'file:b.md',
        },
        {
          id: 'z-heading-reference',
          kind: 'references_heading',
          source: 'heading:b.md:intro',
          target: 'file:a.md',
        },
        {
          id: 'a-heading-reference',
          kind: 'references_heading',
          source: 'file:a.md',
          target: 'heading:b.md:intro',
        },
      ],
    }

    const reversed = graphTopologyOnly({ ...graph, edges: [...graph.edges].reverse() })

    expect(graphTopologyOnly(graph).edges).toEqual([
      {
        id: 'a-heading-reference',
        kind: 'references_heading',
        source: 'file:a.md',
        target: 'file:b.md',
      },
    ])
    expect(reversed.edges).toEqual(graphTopologyOnly(graph).edges)
  })

  it('rejects and removes fields outside the root, edge, and group topology allowlists', () => {
    const graph = {
      mode: 'mindmap',
      revision: 'revision-1',
      workspace_path: 'C:/private',
      nodes: [
        {
          id: 'file:a.md',
          kind: 'file',
          label: 'A',
          path: 'a.md',
          group: {
            key: 'group:a',
            label: 'A',
            source: 'semantic',
            content: 'private group field',
          },
        },
        { id: 'file:b.md', kind: 'file', label: 'B', path: 'b.md' },
      ],
      edges: [
        {
          id: 'link',
          kind: 'links_to',
          source: 'file:a.md',
          target: 'file:b.md',
          content: 'private edge field',
        },
      ],
    } as unknown as FsGraph

    expect(isGraphTopologyOnly(graph)).toBe(false)
    expect(graphTopologyOnly(graph)).toEqual({
      mode: 'mindmap',
      revision: 'revision-1',
      nodes: [
        {
          id: 'file:a.md',
          kind: 'file',
          label: 'A',
          path: 'a.md',
          group: { key: 'group:a', label: 'A', source: 'semantic' },
        },
        { id: 'file:b.md', kind: 'file', label: 'B', path: 'b.md' },
      ],
      edges: [
        {
          id: 'link',
          kind: 'links_to',
          source: 'file:a.md',
          target: 'file:b.md',
        },
      ],
    })
  })
})
