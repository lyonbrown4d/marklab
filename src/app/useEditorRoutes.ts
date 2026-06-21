import { useMemo } from 'react'
import { useMatch, useParams } from 'react-router-dom'
import type { FileViewKind, ViewMode } from '@/store/appTypes'
import {
  FILE_ROUTE_PATTERN,
  GIT_DIFF_ROUTE_PATTERN,
  GRAPH_FILE_ROUTE_PATTERN,
  GRAPH_WORKSPACE_ROUTE_PATTERN,
  PREVIEW_ROUTE_PATTERN,
  SOURCE_ROUTE_PATTERN,
} from '@/logic/routing'
import { getWorkspaceTabPath } from '@/logic/tabs'
import type { WorkspaceTab } from '@/store/appTypes'
import type { FileEntry } from '@/store/appTypes'

type UseEditorRoutesArgs = {
  entries: FileEntry[]
  activeTab: WorkspaceTab | null
  tabViewModes: Record<string, ViewMode>
}

export const useEditorRoutes = ({ entries, activeTab, tabViewModes }: UseEditorRoutesArgs) => {
  const params = useParams()
  const editMatch = useMatch(FILE_ROUTE_PATTERN)
  const gitDiffMatch = useMatch(GIT_DIFF_ROUTE_PATTERN)
  const sourceMatch = useMatch(SOURCE_ROUTE_PATTERN)
  const graphFileMatch = useMatch(GRAPH_FILE_ROUTE_PATTERN)
  const previewMatch = useMatch(PREVIEW_ROUTE_PATTERN)
  const graphWorkspaceMatch = useMatch(GRAPH_WORKSPACE_ROUTE_PATTERN)

  const routeSegment = params['*']
  const gitDiffSection = gitDiffMatch?.params.section
  const gitDiffPath = gitDiffMatch?.params['*'] || null
  const editPath = editMatch?.params['*'] || null
  const sourcePath = sourceMatch?.params['*'] || null
  const graphFilePath = graphFileMatch?.params['*'] || null
  const previewPath = previewMatch?.params['*'] || null
  const routePath = editPath ?? previewPath ?? routeSegment ?? null
  const routeFilePath = editPath ?? sourcePath ?? graphFilePath ?? previewPath
  const routeFileView: FileViewKind | null = sourceMatch
    ? 'source'
    : graphFileMatch
      ? 'graph'
      : previewMatch
        ? 'preview'
        : editMatch
          ? 'edit'
          : null
  const internalRouteActive = Boolean(
    gitDiffMatch ||
    editMatch ||
    sourceMatch ||
    graphFileMatch ||
    previewMatch ||
    graphWorkspaceMatch,
  )
  const isRouteFile = useMemo(
    () =>
      routePath !== null &&
      entries.some((entry) => entry.kind === 'file' && entry.path === routePath),
    [entries, routePath],
  )
  const activeFilePath = activeTab?.kind === 'file' ? activeTab.path : null
  const currentFilePath =
    !internalRouteActive || graphWorkspaceMatch ? null : (routeFilePath ?? activeFilePath)
  const activeResourcePath = !internalRouteActive
    ? null
    : graphWorkspaceMatch
      ? getWorkspaceTabPath(activeTab)
      : (routeFilePath ?? getWorkspaceTabPath(activeTab))
  const viewMode: ViewMode = sourceMatch
    ? 'source'
    : graphFileMatch || graphWorkspaceMatch
      ? 'graph'
      : previewMatch
        ? 'preview'
        : currentFilePath
          ? activeTab?.kind === 'file' && activeTab.view === 'source'
            ? 'source'
            : activeTab?.kind === 'file' && activeTab.view === 'graph'
              ? 'graph'
              : activeTab?.kind === 'file' && activeTab.view === 'preview'
                ? 'preview'
                : (tabViewModes[currentFilePath] ?? 'wysiwyg')
          : 'wysiwyg'

  return {
    editMatch,
    gitDiffMatch,
    sourceMatch,
    graphFileMatch,
    previewMatch,
    graphWorkspaceMatch,
    gitDiffSection,
    gitDiffPath,
    routeFileView,
    routeFilePath,
    routePath,
    internalRouteActive,
    isRouteFile,
    currentFilePath,
    activeResourcePath,
    viewMode,
  }
}
