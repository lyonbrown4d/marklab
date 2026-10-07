import { useCallback, useRef } from 'react'
import { toast } from 'sonner'

import { fetchWorkspaceTreeChildrenPage } from '@/app/projectLoaderUtils'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'

export const useWorkspaceTreeFolderLoader = (failureLabel: string) =>
  useCallback(
    async (path: string) => {
      const store = useWorkspaceStore.getState()
      if (store.loadedTreeParents.includes(path)) return
      store.beginTreeLoad()
      try {
        const result = await fetchWorkspaceTreeChildrenPage(path)
        const current = useWorkspaceStore.getState()
        if (
          current.treeGeneration !== result.generation ||
          current.treeRevision !== result.revision ||
          current.rootKind !== result.root.kind ||
          current.rootPath !== result.root.path
        ) {
          throw new Error('Workspace tree changed while loading this folder')
        }
        current.mergeTreeChildren(
          path,
          result.entries.map((entry) => ({
            kind: entry.kind,
            path: entry.path,
            hasChildren: entry.hasChildren,
            childrenLoaded: entry.kind === 'folder' ? false : undefined,
          })),
          result.generation,
          result.revision,
          result.nextCursor,
        )
      } catch (error) {
        useWorkspaceStore.getState().failTreeLoad(error)
        toast.error(failureLabel, { description: String(error) })
      }
    },
    [failureLabel],
  )

export const useWorkspaceTreeNextPageLoader = (failureLabel: string) => {
  const loading = useRef(new Set<string>())
  const nextParentIndex = useRef(0)
  return useCallback(
    async (requestedParent?: string) => {
      const store = useWorkspaceStore.getState()
      const pendingParents = Object.keys(store.treeNextCursors).filter(
        (candidate) => store.treeNextCursors[candidate] !== null,
      )
      const parent =
        requestedParent ?? pendingParents[nextParentIndex.current % pendingParents.length]
      if (parent === undefined) return
      if (!requestedParent)
        nextParentIndex.current = (nextParentIndex.current + 1) % pendingParents.length
      const cursor = store.treeNextCursors[parent]
      if (!cursor || loading.current.has(parent)) return
      loading.current.add(parent)
      try {
        const result = await fetchWorkspaceTreeChildrenPage(parent, cursor)
        const current = useWorkspaceStore.getState()
        if (
          current.treeGeneration !== result.generation ||
          current.treeRevision !== result.revision ||
          current.rootKind !== result.root.kind ||
          current.rootPath !== result.root.path
        ) {
          throw new Error('Workspace tree changed while loading the next page')
        }
        current.mergeTreeChildren(
          parent,
          result.entries.map((entry) => ({
            kind: entry.kind,
            path: entry.path,
            hasChildren: entry.hasChildren,
            childrenLoaded: entry.kind === 'folder' ? false : undefined,
          })),
          result.generation,
          result.revision,
          result.nextCursor,
          true,
        )
      } catch (error) {
        useWorkspaceStore.getState().failTreeLoad(error)
        toast.error(failureLabel, { description: String(error) })
      } finally {
        loading.current.delete(parent)
      }
    },
    [failureLabel],
  )
}
