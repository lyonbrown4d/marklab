import type { GraphData } from '@/logic/graph'

export const workspaceMapTestGraph: GraphData = {
  nodes: [
    {
      id: 'file:notes/a.md',
      type: 'file',
      data: { label: 'A', path: 'notes/a.md' },
      position: { x: 0, y: 0 },
    },
    {
      id: 'file:notes/b.md',
      type: 'file',
      data: { label: 'B', path: 'notes/b.md' },
      position: { x: 240, y: 0 },
    },
    {
      id: 'preview:docs/brief.pdf',
      type: 'preview',
      data: { label: 'brief.pdf', path: 'docs/brief.pdf', previewKind: 'pdf' },
      position: { x: 480, y: 0 },
    },
    {
      id: 'ext:https://example.com/current',
      type: 'external',
      data: {
        label: 'Current page',
        subtitle: 'example.com',
        url: 'https://example.com/current',
      },
      position: { x: 720, y: 0 },
    },
  ],
  edges: [],
  layoutKey: 'map',
}
