import { describe, expect, it } from 'vitest'
import { buildGraphFromKnowledgeGraph } from '@/logic/graph'
import { buildWorkspaceMapGraph } from '@/logic/workspaceMapGraph'
import type { FsGraph } from '@/services/fsApi'

describe('workspace map graph content', () => {
  it('retains only a bounded backend file summary when graph content mode is none', () => {
    const summary = `Useful document preview ${'detail '.repeat(90)}`
    const graph = buildGraphFromKnowledgeGraph(
      {
        mode: 'mindmap',
        nodes: [
          {
            id: 'file:notes/current.md',
            kind: 'file',
            label: 'current',
            path: 'notes/current.md',
            content: summary,
          },
          {
            id: 'heading:notes/current.md:intro',
            kind: 'heading',
            label: 'Intro',
            path: 'notes/current.md',
            content: 'Heading body remains controlled by graph content mode.',
          },
        ],
        edges: [],
      } satisfies FsGraph,
      'none',
    )

    const mapped = buildWorkspaceMapGraph(graph)
    const file = mapped.nodes.find((node) => node.id === 'file:notes/current.md')

    expect(file?.data.content).toMatch(/^Useful document preview/)
    expect(file?.data.content?.length).toBeLessThanOrEqual(420)
    expect(graph.nodes.find((node) => node.type === 'heading')?.data.content).toBeUndefined()
  })
})
