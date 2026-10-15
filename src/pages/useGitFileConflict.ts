import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useGitRefreshOptions } from '@/features/git/useGitRefreshOptions'
import { gitStatusQueryKey } from '@/logic/gitStatus'
import { isDesktopRuntime } from '@/runtime/environment'
import { gitApiForWorkspace } from '@/services/gitApi'
import type { WorkspaceRootKind } from '@/types/workspaceSession'

interface GitFileConflictOptions {
  rootKind: WorkspaceRootKind
  rootPath: string
  path: string | null
  content: string | undefined
}

// Marker-like prose is only a reason to check Git; the index decides whether to merge.
// Scan isolated marker lines once; incomplete examples must not cause cross-line backtracking.
const markerLines =
  /^(<{1,1024})(?:[ \t][^\r\n]*)?\r?$|^(={1,1024})\r?$|^(>{1,1024})(?:[ \t][^\r\n]*)?\r?$/gm
const hasMarkerCandidate = (content: string) => {
  const opened = new Set<number>()
  const separated = new Set<number>()
  for (const match of content.matchAll(markerLines)) {
    if (match[1]) opened.add(match[1].length)
    else if (match[2] && opened.has(match[2].length)) separated.add(match[2].length)
    else if (match[3] && separated.has(match[3].length)) return true
  }
  return false
}

export const useGitFileConflict = ({
  rootKind,
  rootPath,
  path,
  content,
}: GitFileConflictOptions) => {
  const available = isDesktopRuntime() && rootKind !== 'single' && !!rootPath && !!path
  const candidate = useMemo(() => hasMarkerCandidate(content ?? ''), [content])
  const refresh = useGitRefreshOptions(rootPath)
  const [verified, setVerified] = useState<{ root: string; content: string | undefined }>()
  const status = useQuery({
    ...refresh,
    queryKey: gitStatusQueryKey(rootPath),
    queryFn: () => gitApiForWorkspace(rootPath).getStatus(rootPath),
    enabled: (query) => available && (candidate || query.state.data?.repo.is_repository === true),
    refetchInterval: (query) =>
      query.state.data?.repo.is_repository ? refresh.refetchInterval : false,
    staleTime: 2_000,
    retry: false,
  })
  const refetch = status.refetch
  useEffect(() => {
    if (!available || !candidate) return
    let disposed = false
    // A clean cached snapshot can predate newly appeared markers. Check before mounting an editor.
    void refetch({ cancelRefetch: false }).finally(() => {
      if (!disposed) setVerified({ root: rootPath, content })
    })
    return () => {
      disposed = true
    }
  }, [available, candidate, content, refetch, rootPath])
  return {
    conflict:
      available &&
      status.data?.repo.is_repository === true &&
      status.data.conflicts.some((change) => change.path === path),
    checking:
      available && candidate && (verified?.root !== rootPath || verified.content !== content),
  }
}
