import { useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { toast } from 'sonner'

import { buildFileTree, type FileTreeNode } from '@/logic/fileTree'
import { isDesktopRuntime } from '@/runtime/environment'
import { workspaceTreeApi } from '@/services/workspaceTreeApi'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { useI18n } from '@/i18n/useI18n'

export const useWorkspaceTreeSearch = (query: string): FileTreeNode[] | null => {
  const { t } = useI18n()
  const workspace = useWorkspaceStore(
    useShallow(({ rootKind, rootPath, treeGeneration, treeRevision }) => ({
      rootKind,
      rootPath,
      treeGeneration,
      treeRevision,
    })),
  )
  const [result, setResult] = useState<{
    entries: Parameters<typeof buildFileTree>[0]
    query: string
    workspace: typeof workspace
  } | null>(null)
  const request = useRef(0)
  const normalized = query.trim()

  useEffect(() => {
    const currentRequest = ++request.current
    if (!normalized || !isDesktopRuntime()) return
    let cancelled = false
    const isCurrent = () => {
      const current = useWorkspaceStore.getState()
      return (
        !cancelled &&
        currentRequest === request.current &&
        current.rootKind === workspace.rootKind &&
        current.rootPath === workspace.rootPath &&
        current.treeGeneration === workspace.treeGeneration &&
        current.treeRevision === workspace.treeRevision
      )
    }
    const timer = window.setTimeout(() => {
      void workspaceTreeApi
        .search({ query: normalized })
        .then((result) => {
          if (!isCurrent()) return
          if (
            result.generation !== workspace.treeGeneration ||
            result.revision !== workspace.treeRevision ||
            result.root.kind !== workspace.rootKind ||
            result.root.path !== workspace.rootPath
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
            workspace,
          })
        })
        .catch(() => {
          if (!isCurrent()) return
          setResult(null)
          toast.error(t('search.failed'))
        })
    }, 150)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [normalized, t, workspace])

  return useMemo(
    () =>
      normalized && result?.query === normalized && result.workspace === workspace
        ? buildFileTree(result.entries)
        : null,
    [normalized, result, workspace],
  )
}
