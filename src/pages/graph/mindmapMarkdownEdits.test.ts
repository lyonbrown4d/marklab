import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import type { GraphData, GraphNodeData } from '@/logic/graph'
import {
  insertMindmapParent,
  moveMindmapHeading,
  reorderMindmapHeading,
} from '@/pages/graph/mindmapMarkdownEdits'

const markdown = '# Root\n## Alpha\nAlpha body\n### Leaf\nLeaf body\n## Beta\nBeta body\n'
const node = (id: string, line: number, level: number): Node<GraphNodeData> => ({
  id,
  type: 'heading',
  position: { x: 0, y: 0 },
  data: { label: id, line, level },
})
const edge = (source: string, target: string): Edge => ({
  id: `${source}-${target}`,
  source,
  target,
  data: { kind: 'contains' },
})
const graph: GraphData = {
  nodes: [node('root', 1, 1), node('alpha', 2, 2), node('leaf', 4, 3), node('beta', 6, 2)],
  edges: [edge('root', 'alpha'), edge('alpha', 'leaf'), edge('root', 'beta')],
}

describe('mindmap Markdown structure edits', () => {
  it('reorders a topic together with its complete subtree', () => {
    expect(reorderMindmapHeading(markdown, graph, 'beta', 'up')).toBe(
      '# Root\n## Beta\nBeta body\n## Alpha\nAlpha body\n### Leaf\nLeaf body\n',
    )
  })

  it('reparents a subtree and adjusts every nested heading level', () => {
    expect(moveMindmapHeading(markdown, graph, 'alpha', 'beta', 'child')).toBe(
      '# Root\n## Beta\nBeta body\n### Alpha\nAlpha body\n#### Leaf\nLeaf body\n',
    )
  })

  it('refuses cycles and depth overflow without changing Markdown', () => {
    expect(moveMindmapHeading(markdown, graph, 'alpha', 'leaf', 'child')).toBe(markdown)
    expect(moveMindmapHeading(markdown, graph, 'root', 'alpha', 'child')).toBe(markdown)
  })

  it('inserts a safe parent topic and indents the existing subtree', () => {
    expect(insertMindmapParent(markdown, graph, 'alpha')).toBe(
      '# Root\n## New Topic\n### Alpha\nAlpha body\n#### Leaf\nLeaf body\n## Beta\nBeta body\n',
    )
  })
})
