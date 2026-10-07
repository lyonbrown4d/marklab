import { describe, expect, it, vi } from 'vitest'

vi.mock('@electron/services/workspace/markdown/ast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@electron/services/workspace/markdown/ast')>()

  return { ...actual, parseMarkdownAst: vi.fn(actual.parseMarkdownAst) }
})

import { buildNodeWorkspaceGraph } from '@electron/services/knowledgeEngine/nodeGraph'
import { graphTopologyOnly } from '@electron/services/knowledgeEngine/workspaceGraphTopology'
import { parseMarkdownAst } from '@electron/services/workspace/markdown/ast'

describe('Node workspace graph file summaries', () => {
  it('preserves topology graph identity when no node content needs stripping', () => {
    const graph = { edges: [], mode: 'mindmap' as const, nodes: [] }

    expect(graphTopologyOnly(graph)).toBe(graph)
  })

  it('keeps the topology payload free of document content', () => {
    const graph = buildNodeWorkspaceGraph(
      [{ path: 'notes/a.md', content: '# Alpha\n\nA document body.' }],
      { paths: ['notes/a.md'], assetPaths: [] },
    )

    expect(graph.nodes.find((node) => node.id === 'file:notes/a.md')).not.toHaveProperty('content')
    expect(graph.nodes.find((node) => node.id === 'file:notes/a.md')).not.toHaveProperty(
      'content_blocks',
    )
  })

  it('includes previewable local references in the backend graph', () => {
    const graph = buildNodeWorkspaceGraph(
      [
        {
          path: 'docs/current.md',
          content: [
            '![Architecture](../assets/architecture.png)',
            '[Specification](../assets/specification.pdf)',
            '[Implementation](../src/example.ts)',
          ].join('\n'),
        },
      ],
      {
        paths: [
          'docs/current.md',
          'assets/architecture.png',
          'assets/specification.pdf',
          'src/example.ts',
        ],
        assetPaths: ['assets/architecture.png', 'assets/specification.pdf', 'src/example.ts'],
      },
    )

    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'preview:assets/architecture.png',
          kind: 'preview',
          path: 'assets/architecture.png',
          preview_kind: 'image',
          source_path: 'docs/current.md',
        }),
        expect.objectContaining({
          id: 'preview:assets/specification.pdf',
          kind: 'preview',
          preview_kind: 'pdf',
        }),
        expect.objectContaining({
          id: 'preview:src/example.ts',
          kind: 'preview',
          preview_kind: 'source',
        }),
      ]),
    )
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'previews',
          source: 'file:docs/current.md',
          target: 'preview:assets/architecture.png',
        }),
      ]),
    )
  })

  it('resolves extensionless Markdown links against indexed files in the same directory', () => {
    const graph = buildNodeWorkspaceGraph(
      [
        { path: 'docs/current.md', content: '[架构总览](architecture-overview)' },
        { path: 'docs/architecture-overview.md', content: '# 架构总览' },
      ],
      {
        paths: ['docs/current.md', 'docs/architecture-overview.md'],
        assetPaths: [],
      },
    )

    expect(graph.edges).toContainEqual(
      expect.objectContaining({
        source: 'file:docs/current.md',
        target: 'file:docs/architecture-overview.md',
      }),
    )
    expect(graph.nodes.some((node) => node.kind === 'missing')).toBe(false)
  })

  it('parses each Markdown document exactly once while building topology', () => {
    vi.mocked(parseMarkdownAst).mockClear()

    buildNodeWorkspaceGraph(
      [
        { path: 'notes/a.md', content: '# Alpha\n\nAlpha summary.' },
        { path: 'notes/b.md', content: '# Beta\n\nBeta summary.' },
      ],
      { paths: ['notes/a.md', 'notes/b.md'], assetPaths: [] },
    )

    expect(parseMarkdownAst).toHaveBeenCalledTimes(2)
  })
})
