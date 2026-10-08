import { describe, expect, it } from 'vitest'

import {
  graphTopologyOnly,
  isGraphTopologyOnly,
} from '@electron/services/knowledgeEngine/workspaceGraphTopology'
import type { FsGraph } from '@electron/services/workspace/types'

describe('workspace graph topology validation', () => {
  it('normalizes invalid topology field values without trusting a typed cast', () => {
    const graph = {
      mode: 'mindmap',
      revision: { forged: true },
      nodes: [
        {
          id: 'file:a.md',
          kind: 'file',
          label: 'A',
          path: { forged: true },
          group: { key: 'group:a', label: 7, source: 'semantic' },
        },
        {
          id: 'preview:asset',
          kind: 'preview',
          label: 'Asset',
          path: 'asset.bin',
          preview_kind: 'archive',
          source_path: 7,
          target: { forged: true },
        },
        { id: { forged: true }, kind: 'file', label: 'Forged id' },
        { id: 'file:bad-label.md', kind: 'file', label: { forged: true } },
        { id: 'file:bad-kind.md', kind: 'archive', label: 'Bad kind' },
      ],
      edges: [
        {
          id: 'valid-link',
          kind: 'links_to',
          source: 'file:a.md',
          target: 'preview:asset',
        },
        {
          id: { forged: true },
          kind: 'links_to',
          source: 'file:a.md',
          target: 'preview:asset',
        },
        {
          id: 'bad-kind',
          kind: 'contains-everything',
          source: 'file:a.md',
          target: 'preview:asset',
        },
        {
          id: 'bad-source',
          kind: 'links_to',
          source: { forged: true },
          target: 'preview:asset',
        },
        {
          id: 'bad-target',
          kind: 'links_to',
          source: 'file:a.md',
          target: Number.POSITIVE_INFINITY,
        },
      ],
    } as unknown as FsGraph

    expect(isGraphTopologyOnly(graph)).toBe(false)
    expect(graphTopologyOnly(graph)).toEqual({
      mode: 'mindmap',
      nodes: [
        { id: 'file:a.md', kind: 'file', label: 'A' },
        {
          id: 'preview:asset',
          kind: 'preview',
          label: 'Asset',
          path: 'asset.bin',
        },
      ],
      edges: [
        {
          id: 'valid-link',
          kind: 'links_to',
          source: 'file:a.md',
          target: 'preview:asset',
        },
      ],
    })
  })
})
