import { describe, expect, it } from 'vitest'
import { buildGraphFromRustGraph, buildGraphFromWorkspaceIndex } from '@/logic/graph'
import { appendPreviewNodesFromWorkspaceIndex } from '@/logic/graphPreviewNodes'
import type { FsGraph, FsWorkspaceIndex } from '@/services/fsApi'

describe('graphPreviewNodes', () => {
  it('adds preview nodes for previewable markdown assets from the workspace index', () => {
    const graph = buildGraphFromWorkspaceIndex({
      files: [
        {
          path: 'notes/current.md',
          headings: [],
          links: [],
          assets: [
            {
              column: 1,
              context: '[Brief](../docs/brief.pdf)',
              is_external: false,
              line: 3,
              media_type: 'application/pdf',
              source_path: 'notes/current.md',
              target: '../docs/brief.pdf',
              target_path: 'docs/brief.pdf',
              text: 'Brief',
            },
          ],
        },
      ],
    } satisfies FsWorkspaceIndex)

    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'preview:docs/brief.pdf',
          type: 'preview',
          data: expect.objectContaining({
            label: 'brief.pdf',
            path: 'docs/brief.pdf',
            previewKind: 'pdf',
          }),
        }),
      ]),
    )
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'file:notes/current.md',
          target: 'preview:docs/brief.pdf',
        }),
      ]),
    )
  })

  it('can append preview nodes to Rust graph output without changing the graph schema', () => {
    const graph = appendPreviewNodesFromWorkspaceIndex(
      buildGraphFromRustGraph({
        mode: 'mindmap',
        nodes: [
          {
            id: 'file:notes/current.md',
            kind: 'file',
            label: 'current',
            path: 'notes/current.md',
          },
        ],
        edges: [],
      } satisfies FsGraph),
      {
        files: [
          {
            path: 'notes/current.md',
            headings: [],
            links: [
              {
                column: 1,
                context: '[Plan](plan.docx)',
                is_external: false,
                line: 2,
                link_type: 'markdown',
                source_path: 'notes/current.md',
                target: 'plan.docx',
                target_anchor: null,
                target_heading_slug: null,
                target_path: 'notes/plan.docx',
                text: 'Plan',
              },
            ],
            assets: [],
          },
        ],
      } satisfies FsWorkspaceIndex,
    )

    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'preview:notes/plan.docx',
          type: 'preview',
          data: expect.objectContaining({ previewKind: 'docx' }),
        }),
      ]),
    )
  })
})
