import { create } from 'zustand'
import { useMemo } from 'react'
import { matchPath, parsePath } from 'react-router-dom'
import {
  FILE_ROUTE_PATTERN,
  SOURCE_ROUTE_PATTERN,
  PREVIEW_ROUTE_PATTERN,
  GRAPH_WORKSPACE_ROUTE_PATTERN,
} from '@/logic/routing'
import type { FileViewKind, WorkspaceTab } from '@/store/appTypes'

export const documentAtRoute = (route: string) => {
  const pathname = parsePath(route).pathname ?? '/'
  for (const [pattern, view] of [
    [FILE_ROUTE_PATTERN, 'edit'],
    [SOURCE_ROUTE_PATTERN, 'source'],
    [PREVIEW_ROUTE_PATTERN, 'preview'],
  ] as const) {
    const match = matchPath(pattern, pathname)
    const path = match?.params['*']
    if (path) {
      try {
        return { path: decodeURIComponent(path), view: view as FileViewKind }
      } catch {
        return { path, view: view as FileViewKind }
      }
    }
  }
  return null
}

type WorkspaceSurface = { paths: string[]; visiblePaths: string[]; graphVisible: boolean }
const EMPTY: WorkspaceSurface = { paths: [], visiblePaths: [], graphVisible: false }
export const useWorkbenchState = create<{ workspaces: Record<string, WorkspaceSurface> }>(() => ({
  workspaces: {},
}))
export const emptyWorkbenchSurface = EMPTY
export const useWorkbenchBufferPaths = (key: string, tabs: WorkspaceTab[]) => {
  const surface = useWorkbenchState((state) => state.workspaces[key] ?? EMPTY)
  const openPaths = useMemo(
    () => [
      ...new Set([
        ...tabs.flatMap((tab) => (tab.kind === 'file' ? [tab.path] : [])),
        ...surface.paths,
      ]),
    ],
    [surface.paths, tabs],
  )
  return { openPaths, visiblePaths: surface.visiblePaths }
}
export const setWorkbenchSurface = (
  workspaceKey: string,
  routes: string[],
  visibleRoutes: string[],
) => {
  const paths = (items: string[]) =>
    [
      ...new Set(
        items.flatMap((route) => {
          const document = documentAtRoute(route)
          return document ? [document.path] : []
        }),
      ),
    ].sort()
  const surface = {
    paths: paths(routes),
    visiblePaths: paths(visibleRoutes),
    graphVisible: visibleRoutes.some(
      (route) => parsePath(route).pathname === GRAPH_WORKSPACE_ROUTE_PATTERN,
    ),
  }
  useWorkbenchState.setState((state) => {
    if (JSON.stringify(state.workspaces[workspaceKey] ?? EMPTY) === JSON.stringify(surface))
      return state
    return { workspaces: { ...state.workspaces, [workspaceKey]: surface } }
  })
}
export const clearWorkbenchSurface = (workspaceKey: string) =>
  useWorkbenchState.setState((state) => {
    const workspaces = { ...state.workspaces }
    delete workspaces[workspaceKey]
    return { workspaces }
  })
