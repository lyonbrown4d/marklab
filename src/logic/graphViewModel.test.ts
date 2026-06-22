import type { Edge, Node } from '@xyflow/react'
import { describe, expect, it } from 'vitest'

import type { GraphNodeData } from '@/logic/graph'
import {
  buildGraphNodeDetails,
  createDefaultGraphFilters,
  filterGraphElements,
  getGraphFilterStats,
  getGraphNodeKind,
  getGraphNodeOpenPath,
} from '@/logic/graphViewModel'

const node = (id: string, data: Partial<GraphNodeData>, type?: string): Node<GraphNodeData> => ({
  id,
  type,
  data: { label: id, ...data } as GraphNodeData,
  position: { x: 0, y: 0 },
})

const nodes = [
  node('file:notes/current.md', { label: 'Current', path: 'notes/current.md' }),
  node(
    'heading:notes/current.md:intro',
    {
      content: 'Intro body text',
      label: 'Intro',
      level: 1,
      line: 3,
      path: 'notes/current.md',
    },
    'heading',
  ),
  node('ext:https://example.com', { label: 'Example', url: 'https://example.com' }, 'external'),
  node('missing:notes/missing.md', { label: 'Missing', path: 'notes/missing.md' }, 'missing'),
  node('preview:docs/brief.pdf', { label: 'Brief', path: 'docs/brief.pdf' }, 'preview'),
]

const edges: Edge[] = [
  {
    id: 'file-heading',
    source: 'file:notes/current.md',
    target: 'heading:notes/current.md:intro',
    data: { kind: 'contains' },
  },
  {
    id: 'file-external',
    source: 'file:notes/current.md',
    target: 'ext:https://example.com',
  },
]

describe('graphViewModel', () => {
  it('classifies graph nodes and openable markdown paths', () => {
    expect(nodes.map(getGraphNodeKind)).toEqual([
      'file',
      'heading',
      'external',
      'missing',
      'preview',
    ])
    expect(getGraphNodeOpenPath(nodes[0])).toBe('notes/current.md')
    expect(getGraphNodeOpenPath(nodes[1])).toBe('notes/current.md')
    expect(getGraphNodeOpenPath(nodes[2])).toBeUndefined()
    expect(getGraphNodeOpenPath(nodes[4])).toBe('docs/brief.pdf')
  })

  it('filters nodes by kind and query while pruning disconnected edges', () => {
    const filters = createDefaultGraphFilters()
    const hiddenExternal = filterGraphElements(nodes, edges, {
      ...filters,
      kinds: { ...filters.kinds, external: false },
    })

    expect(hiddenExternal.nodes.map((item) => item.id)).not.toContain('ext:https://example.com')
    expect(hiddenExternal.edges.map((item) => item.id)).toEqual(['file-heading'])

    const queried = filterGraphElements(nodes, edges, { ...filters, query: 'intro body' })

    expect(queried.nodes.map((item) => item.id)).toEqual(['heading:notes/current.md:intro'])
    expect(queried.edges).toEqual([])
  })

  it('builds selected node details from graph connections', () => {
    const details = buildGraphNodeDetails(nodes, edges, 'file:notes/current.md')

    expect(details).toMatchObject({
      kind: 'file',
      label: 'Current',
      openPath: 'notes/current.md',
      path: 'notes/current.md',
    })
    expect(details?.outgoing[0]?.edge).toEqual(expect.objectContaining({ id: 'file-heading' }))
    expect(details?.outgoing).toHaveLength(2)
    expect(details?.incoming).toHaveLength(0)
  })

  it('counts filter stats by visible node kind', () => {
    expect(getGraphFilterStats(nodes)).toEqual({
      external: 1,
      file: 1,
      heading: 1,
      missing: 1,
      preview: 1,
    })
  })
})
