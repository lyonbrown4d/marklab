import { describe, expect, it } from 'vitest'

import {
  buildOutlineGraph,
  buildWorkspaceGraph,
  parseMarkdownDocument,
} from '@electron/services/workspace/markdown.js'
import type { FsWorkspaceIndex } from '@electron/services/workspace/types.js'

describe('markdown graph builders', () => {
  it('resolves repeated markdown heading links to one heading node containment edge', () => {
    const index = {
      files: [
        parseMarkdownDocument(
          'notes/current.md',
          'See [API](../refs.md#api) and [API again](../refs.md#api).',
        ),
        parseMarkdownDocument('refs.md', '# API\n\nReference details.'),
      ],
      paths: ['notes/current.md', 'refs.md'],
      asset_paths: [],
    } satisfies FsWorkspaceIndex

    const graph = buildWorkspaceGraph(index)

    expect(graph.mode).toBe('mindmap')
    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'file:notes/current.md',
          kind: 'file',
          label: 'current',
          path: 'notes/current.md',
        }),
        expect.objectContaining({
          id: 'file:refs.md',
          kind: 'file',
          label: 'refs',
          path: 'refs.md',
        }),
        expect.objectContaining({
          id: 'heading:refs.md:api',
          kind: 'heading',
          label: 'API',
          path: 'refs.md',
          line: 1,
          level: 1,
          slug: 'api',
        }),
      ]),
    )

    const headingContainsEdges = graph.edges.filter(
      (edge) =>
        edge.kind === 'contains' &&
        edge.source === 'file:refs.md' &&
        edge.target === 'heading:refs.md:api',
    )
    const headingReferenceEdges = graph.edges.filter(
      (edge) =>
        edge.kind === 'references_heading' &&
        edge.source === 'file:notes/current.md' &&
        edge.target === 'heading:refs.md:api',
    )

    expect(headingContainsEdges).toHaveLength(1)
    expect(headingReferenceEdges).toHaveLength(2)
    expect(graph.nodes.some((node) => node.id === 'missing:refs.md')).toBe(false)
  })

  it('builds outline hierarchy with heading content ranges and parsed content blocks', () => {
    const content = [
      '# Title',
      'Intro paragraph.',
      '',
      '## Details',
      '- first',
      '- second',
      '',
      '# Next',
      'Tail paragraph.',
    ].join('\n')

    const graph = buildOutlineGraph('notes/current.md', content)

    expect(graph.mode).toBe('outline')
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'file:notes/current.md',
          target: 'heading:notes/current.md:title',
          kind: 'contains',
        }),
        expect.objectContaining({
          source: 'heading:notes/current.md:title',
          target: 'heading:notes/current.md:details',
          kind: 'contains',
        }),
        expect.objectContaining({
          source: 'file:notes/current.md',
          target: 'heading:notes/current.md:next',
          kind: 'contains',
        }),
      ]),
    )

    const title = graph.nodes.find((node) => node.id === 'heading:notes/current.md:title')
    const details = graph.nodes.find((node) => node.id === 'heading:notes/current.md:details')
    const next = graph.nodes.find((node) => node.id === 'heading:notes/current.md:next')

    expect(title).toMatchObject({
      kind: 'heading',
      label: 'Title',
      line: 1,
      level: 1,
      content: 'Intro paragraph.',
      content_start_line: 2,
      content_end_line: 4,
      content_blocks: [expect.objectContaining({ kind: 'paragraph', text: 'Intro paragraph.' })],
    })
    expect(details).toMatchObject({
      kind: 'heading',
      label: 'Details',
      line: 4,
      level: 2,
      content: '- first\n- second',
      content_start_line: 5,
      content_end_line: 8,
      content_blocks: [expect.objectContaining({ kind: 'list' })],
    })
    expect(next).toMatchObject({
      kind: 'heading',
      label: 'Next',
      line: 8,
      level: 1,
      content: 'Tail paragraph.',
      content_start_line: 9,
      content_end_line: 10,
    })
  })
})
