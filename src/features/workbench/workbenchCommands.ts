import { basename } from 'pathe'
import { pathToFileViewRoute } from '@/logic/routing'
import type { WorkspaceDockHandle } from '@/features/workbench/dockTypes'
import { documentAtRoute } from '@/features/workbench/workbenchState'
import type { BeginEditorPathMutation } from '@/app/useEditorBufferPathMutation'

const workspaces = new Map<string, WorkspaceDockHandle>()
export const registerWorkspaceDock = (key: string, handle: WorkspaceDockHandle) => {
  workspaces.set(key, handle)
  return () => {
    if (workspaces.get(key) === handle) workspaces.delete(key)
  }
}
export const closeActiveWorkspacePane = (key: string) => {
  const dock = workspaces.get(key)
  const active = dock?.getActiveTab()
  if (!dock || !active) return false
  dock.close(active.id)
  return true
}
export const beginWorkspacePanePathMutation = (
  key: string,
  begin: BeginEditorPathMutation,
  from: string,
  to: string,
) => {
  const finish = begin(from, to)
  return (committed: boolean) => {
    finish(committed)
    if (committed) remapWorkspacePanePaths(key, from, to)
  }
}
export const remapWorkspacePanePaths = (key: string, from: string, to: string) => {
  const dock = workspaces.get(key)
  if (!dock) return
  for (const tab of dock.getTabs()) {
    const document = documentAtRoute(tab.route)
    if (!document || (document.path !== from && !document.path.startsWith(`${from}/`))) continue
    const path = to + document.path.slice(from.length)
    dock.open(
      { ...tab, route: pathToFileViewRoute(path, document.view), title: basename(path) },
      { activate: false },
    )
  }
}
