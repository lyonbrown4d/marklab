import { describe, expect, it } from 'vitest'
import { buildGraphFromKnowledgeGraph } from '@/logic/graph'
import { buildWorkspaceMapGraph } from '@/logic/workspaceMapGraph'
import type { FsGraph } from '@/services/fsApi'

describe('workspace map graph content', () => {
  it('keeps topology free of document content until details are requested', () => {
    const native: FsGraph = {
      mode: 'mindmap',
      revision: '1:1',
      nodes: [
        {
          id: 'file:notes/current.md',
          kind: 'file',
          label: 'current',
          path: 'notes/current.md',
          group: { key: 'notes', label: 'notes', source: 'path' },
        },
      ],
      edges: [],
    }
    const mapped = buildWorkspaceMapGraph(buildGraphFromKnowledgeGraph(native, 'none'))
    const file = mapped.nodes.find((node) => node.id === 'file:notes/current.md')
    expect(file?.data.path).toBe('notes/current.md')
    expect(file?.data.content).toBeUndefined()
    expect(file?.data.preview).toBeUndefined()
  })
})
