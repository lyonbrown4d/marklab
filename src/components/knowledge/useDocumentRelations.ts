import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fsApi } from '@/services/fsApi'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'

export type RelationDirection = 'both' | 'incoming' | 'outgoing'

export const useDocumentRelations = (workspaceKey: string, targetPath: string) => {
  const [pinned, setPinned] = useState<{ workspaceKey: string; path: string } | null>(null)
  const [depth, setDepth] = useState<1 | 2>(1)
  const [direction, setDirection] = useState<RelationDirection>('both')
  const pinnedPath = pinned?.workspaceKey === workspaceKey ? pinned.path : null
  const centerPath = pinnedPath ?? targetPath
  const currentWorkspaceKey = useWorkspaceStore((state) => `${state.rootKind}:${state.rootPath}`)
  const request = {
    center_path: centerPath,
    depth,
    direction,
    include_attachments: true,
    include_missing: true,
    max_nodes: 120,
    max_edges: 240,
  }
  const query = useQuery({
    queryKey: ['workspace-graph', workspaceKey, 'document-relations', request],
    enabled: workspaceKey === currentWorkspaceKey,
    queryFn: async ({ signal }) => {
      signal.throwIfAborted()
      const state = useWorkspaceStore.getState()
      if (`${state.rootKind}:${state.rootPath}` !== workspaceKey) {
        throw new Error('Workspace changed')
      }
      const graph = await fsApi.getWorkspaceGraph(request)
      signal.throwIfAborted()
      return graph
    },
    staleTime: 15_000,
    gcTime: 60_000,
    retry: false,
  })
  return {
    query,
    centerPath,
    depth,
    setDepth,
    direction,
    setDirection,
    pinned: pinnedPath !== null,
    togglePinned: () => setPinned(pinnedPath ? null : { workspaceKey, path: centerPath }),
  }
}
