import type { GraphData } from '@/logic/graph'

export const testGraph = (): GraphData => ({
  mode: 'relations',
  revision: 'revision-1',
  topology_key: 'topology-1',
  truncated: false,
  total_nodes: 3,
  total_edges: 2,
  nodes: [
    {
      id: 'file:a.md',
      position: { x: 0, y: 0 },
      kind: 'file',
      label: 'Alpha',
      path: 'a.md',
      group: { key: '.', label: '.', source: 'path' },
    },
    {
      id: 'file:b.md',
      position: { x: 200, y: 40 },
      kind: 'file',
      label: 'Beta',
      path: 'b.md',
      group: { key: '.', label: '.', source: 'path' },
    },
    {
      id: 'missing:c.md',
      position: { x: -180, y: 80 },
      kind: 'missing',
      label: 'Missing',
      path: 'c.md',
      preview_kind: 'source',
      source_path: 'a.md',
      target: 'c.md',
    },
  ],
  edges: [
    { id: 'a-b', source: 'file:a.md', target: 'file:b.md', kind: 'links_to', count: 3 },
    { id: 'a-c', source: 'file:a.md', target: 'missing:c.md', kind: 'links_to', count: 1 },
  ],
})
