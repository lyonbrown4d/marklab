import { useEffect, useMemo, useState } from 'react'
import { useMatch, useParams } from 'react-router-dom'
import type { FileEntry, FileViewKind, ViewMode, WorkspaceTab } from '@/store/appTypes'
import {
  ALL_PAGES_ROUTE_PATTERN,
  FILE_ROUTE_PATTERN,
  GIT_DIFF_ROUTE_PATTERN,
  GRAPH_WORKSPACE_ROUTE_PATTERN,
  PREVIEW_ROUTE_PATTERN,
  SOURCE_ROUTE_PATTERN,
  WEB_TAB_ROUTE_PATTERN,
} from '@/logic/routing'
import { getWorkspaceTabPath } from '@/logic/tabs'
import { isDesktopRuntime } from '@/runtime/environment'
import { workspaceTreeApi } from '@/services/workspaceTreeApi'

type UseEditorRoutesArgs = {
  entries: FileEntry[]
  activeTab: WorkspaceTab | null
  tabViewModes: Record<string, ViewMode>
  treeGeneration: number
  treeRevision: number
  rootKind: 'internal' | 'external' | 'single'
  rootPath: string
}

export type WorkspaceView = 'files' | 'map'

type ResolveEditorViewModeArgs = {
  activeTab: WorkspaceTab | null
  currentFilePath: string | null
  previewRouteActive: boolean
  sourceRouteActive: boolean
  tabViewModes: Record<string, ViewMode>
}

export const resolveEditorViewMode = ({
  activeTab,
  currentFilePath,
  previewRouteActive,
  sourceRouteActive,
  tabViewModes,
}: ResolveEditorViewModeArgs): ViewMode => {
  if (sourceRouteActive) return 'source'
  if (previewRouteActive) return 'preview'
  if (!currentFilePath) return 'wysiwyg'

  const activeTabView = activeTab?.kind === 'file' ? activeTab.view : null
  if (activeTabView === 'source' || activeTabView === 'preview') {
    return activeTabView
  }

  return tabViewModes[currentFilePath] ?? 'wysiwyg'
}

export const useEditorRoutes = ({
  entries,
  activeTab,
  tabViewModes,
  treeGeneration,
  treeRevision,
  rootKind,
  rootPath,
}: UseEditorRoutesArgs) => {
  const params = useParams()
  const editMatch = useMatch(FILE_ROUTE_PATTERN)
  const gitDiffMatch = useMatch(GIT_DIFF_ROUTE_PATTERN)
  const sourceMatch = useMatch(SOURCE_ROUTE_PATTERN)
  const previewMatch = useMatch(PREVIEW_ROUTE_PATTERN)
  const graphWorkspaceMatch = useMatch(GRAPH_WORKSPACE_ROUTE_PATTERN)
  const allPagesMatch = useMatch(ALL_PAGES_ROUTE_PATTERN)
  const webMatch = useMatch(WEB_TAB_ROUTE_PATTERN)

  const routeSegment = params['*']
  const gitDiffSection = gitDiffMatch?.params.section
  const gitDiffPath = gitDiffMatch?.params['*'] || null
  const editPath = editMatch?.params['*'] || null
  const sourcePath = sourceMatch?.params['*'] || null
  const previewPath = previewMatch?.params['*'] || null
  const routePath = editPath ?? previewPath ?? routeSegment ?? null
  const routeFilePath = editPath ?? sourcePath ?? previewPath
  const routeFileView: FileViewKind | null = sourceMatch
    ? 'source'
    : previewMatch
      ? 'preview'
      : editMatch
        ? 'edit'
        : null
  const internalRouteActive = Boolean(
    gitDiffMatch ||
    editMatch ||
    sourceMatch ||
    previewMatch ||
    graphWorkspaceMatch ||
    allPagesMatch ||
    webMatch,
  )
  const locallyKnownRoute = useMemo(
    () =>
      Boolean(
        routePath && entries.some((entry) => entry.kind === 'file' && entry.path === routePath),
      ),
    [entries, routePath],
  )
  const [remoteRoute, setRemoteRoute] = useState<{
    exists: boolean
    generation: number
    path: string
    revision: number
    rootKind: UseEditorRoutesArgs['rootKind']
    rootPath: string
  } | null>(null)
  useEffect(() => {
    if (!routePath || locallyKnownRoute || !isDesktopRuntime()) return
    let cancelled = false
    void workspaceTreeApi
      .pathsExist({ kind: 'file', paths: [routePath] })
      .then((result) => {
        if (
          cancelled ||
          result.generation !== treeGeneration ||
          result.revision !== treeRevision ||
          result.root.kind !== rootKind ||
          result.root.path !== rootPath
        )
          return
        setRemoteRoute({
          exists: result.existing.includes(routePath),
          generation: treeGeneration,
          path: routePath,
          revision: treeRevision,
          rootKind,
          rootPath,
        })
      })
      .catch(() => {
        if (cancelled) return
        setRemoteRoute({
          exists: false,
          generation: treeGeneration,
          path: routePath,
          revision: treeRevision,
          rootKind,
          rootPath,
        })
      })
    return () => {
      cancelled = true
    }
  }, [locallyKnownRoute, rootKind, rootPath, routePath, treeGeneration, treeRevision])
  const isRouteFile =
    locallyKnownRoute ||
    Boolean(
      remoteRoute?.exists &&
      remoteRoute.path === routePath &&
      remoteRoute.generation === treeGeneration &&
      remoteRoute.revision === treeRevision &&
      remoteRoute.rootKind === rootKind &&
      remoteRoute.rootPath === rootPath,
    )
  const confirmedRouteFilePath = isRouteFile ? routeFilePath : null
  const activeFilePath = activeTab?.kind === 'file' ? activeTab.path : null
  const currentFilePath =
    !internalRouteActive || graphWorkspaceMatch || allPagesMatch
      ? null
      : (confirmedRouteFilePath ?? activeFilePath)
  const activeResourcePath = !internalRouteActive
    ? null
    : graphWorkspaceMatch || allPagesMatch
      ? getWorkspaceTabPath(activeTab)
      : (confirmedRouteFilePath ?? getWorkspaceTabPath(activeTab))
  const viewMode = resolveEditorViewMode({
    activeTab,
    currentFilePath,
    previewRouteActive: Boolean(previewMatch),
    sourceRouteActive: Boolean(sourceMatch),
    tabViewModes,
  })
  const workspaceView: WorkspaceView = graphWorkspaceMatch ? 'map' : 'files'

  return {
    editMatch,
    gitDiffMatch,
    sourceMatch,
    previewMatch,
    graphWorkspaceMatch,
    allPagesMatch,
    webMatch,
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
    workspaceView,
  }
}
