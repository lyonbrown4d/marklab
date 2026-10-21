import { describe, expect, it } from 'vitest'
import { buildGraphFromKnowledgeGraph } from '@/logic/graph'
import type { FsGraph } from '@/services/fsApi'

const topology = (): FsGraph => ({
  mode: 'mindmap',
  revision: 'graph-v2',
  nodes: [
    {
      id: 'file:notes/current.md',
      kind: 'file',
      label: 'current',
      path: 'notes/current.md',
      group: { key: 'notes', label: 'notes', source: 'path' },
    },
    {
      id: 'preview:docs/brief.pdf',
      kind: 'preview',
      label: 'brief.pdf',
      path: 'docs/brief.pdf',
      preview_kind: 'pdf',
      source_path: 'notes/current.md',
      target: 'docs/brief.pdf',
    },
  ],
  edges: [
    {
      id: 'file:notes/current.md->preview:docs/brief.pdf',
      source: 'file:notes/current.md',
      target: 'preview:docs/brief.pdf',
      kind: 'previews',
    },
  ],
})

describe('buildGraphFromKnowledgeGraph', () => {
  it('maps generated topology to display nodes and preserves native revision and groups', () => {
    const graph = buildGraphFromKnowledgeGraph(topology(), 'full')
    expect(graph.revision).toBe('graph-v2')
    expect(graph.nodes[0]).toMatchObject({
      id: 'file:notes/current.md',
      type: 'file',
      data: {
        label: 'current',
        subtitle: 'notes/current.md',
        contentMode: 'full',
        workspaceGroup: { key: 'notes', label: 'notes', source: 'path' },
      },
    })
    expect(graph.nodes[1]).toMatchObject({
      id: 'preview:docs/brief.pdf',
      type: 'preview',
      data: {
        previewKind: 'pdf',
        sourcePath: 'notes/current.md',
        target: 'docs/brief.pdf',
      },
    })
    expect(graph.edges[0]).toMatchObject({
      className: 'graph-edge--reference',
      type: 'smoothstep',
      data: { kind: 'previews' },
    })
    expect(graph.nodes.every((node) => node.position.x === 0 && node.position.y === 0)).toBe(true)
  })

  it('maps missing targets without pretending they are workspace files', () => {
    const native = topology()
    native.nodes[1] = {
      id: 'missing:missing.md',
      kind: 'missing',
      label: 'missing.md',
      path: 'missing.md',
      preview_kind: 'source',
      source_path: 'notes/current.md',
      target: 'missing.md',
    }
    expect(buildGraphFromKnowledgeGraph(native).nodes[1]).toMatchObject({
      type: 'missing',
      data: { path: 'missing.md', target: 'missing.md', workspaceGroup: undefined },
    })
  })

  it('keeps layout keys independent of backend node order and revision-only changes', () => {
    const native = topology()
    const first = buildGraphFromKnowledgeGraph(native)
    const reordered = buildGraphFromKnowledgeGraph({
      ...native,
      revision: 'graph-v3',
      nodes: [...native.nodes].reverse(),
      edges: [...native.edges].reverse(),
    })
    expect(reordered.layoutKey).toBe(first.layoutKey)
    expect(first.layoutKey).not.toContain('file:notes/current.md')
  })

  it('changes the layout key when native graph structure changes', () => {
    const native = topology()
    const first = buildGraphFromKnowledgeGraph(native).layoutKey
    expect(buildGraphFromKnowledgeGraph({ ...native, edges: [] }).layoutKey).not.toBe(first)
    expect(buildGraphFromKnowledgeGraph({ ...native, nodes: [] }).layoutKey).not.toBe(first)
  })
})
