import type { GraphData } from '@/logic/graph'

export const createWorkspaceMapProductTestGraph = (): GraphData => {
  const files = Array.from({ length: 14 }, (_, index) => ({
    id: `file:notes/${index === 0 ? 'Home' : `note-${index}`}.md`,
    type: 'file' as const,
    data: {
      label: index === 0 ? 'Home' : `Note ${index}`,
      path: `notes/${index === 0 ? 'Home' : `note-${index}`}.md`,
      workspaceGroup:
        index < 7
          ? { key: 'documentation', label: 'Documentation', source: 'semantic' as const }
          : { key: 'libraries', label: 'Libraries', source: 'semantic' as const },
    },
    position: { x: index * 240, y: 0 },
  }))

  return {
    nodes: [
      ...files,
      {
        id: 'ext:https://example.com/docs',
        type: 'external',
        data: { label: 'External docs', url: 'https://example.com/docs' },
        position: { x: 0, y: 200 },
      },
    ],
    edges: [
      { id: 'internal', source: files[0].id, target: files[1].id },
      { id: 'external', source: files[0].id, target: 'ext:https://example.com/docs' },
    ],
    layoutKey: 'large-map',
  }
}
