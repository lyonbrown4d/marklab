import { useEffect, useMemo, useRef, useState } from 'react'

import { buildFileTree, type FileTreeNode } from '@/logic/fileTree'
import { isDesktopRuntime } from '@/runtime/environment'
import { workspaceTreeApi } from '@/services/workspaceTreeApi'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'

export const useWorkspaceTreeSearch = (query: string): FileTreeNode[] | null => {
  const [result, setResult] = useState<{
    entries: Parameters<typeof buildFileTree>[0]
    query: string
  } | null>(null)
  const request = useRef(0)
  const normalized = query.trim()

  useEffect(() => {
    const currentRequest = ++request.current
    if (!normalized || !isDesktopRuntime()) return
    const timer = window.setTimeout(() => {
      void workspaceTreeApi
        .search({ query: normalized })
        .then((result) => {
          if (currentRequest !== request.current) return
          const state = useWorkspaceStore.getState()
          if (
            result.generation !== state.treeGeneration ||
            result.revision !== state.treeRevision ||
            result.root.kind !== state.rootKind ||
            result.root.path !== state.rootPath
          )
            return
          setResult({
            entries: result.entries.map((entry) => ({
              childrenLoaded: false,
              hasChildren: entry.hasChildren,
              kind: entry.kind,
              path: entry.path,
            })),
            query: normalized,
          })
        })
        .catch(() => {
          if (currentRequest === request.current) setResult({ entries: [], query: normalized })
        })
    }, 150)
    return () => window.clearTimeout(timer)
  }, [normalized])

  return useMemo(
    () => (normalized && result?.query === normalized ? buildFileTree(result.entries) : null),
    [normalized, result],
  )
}
