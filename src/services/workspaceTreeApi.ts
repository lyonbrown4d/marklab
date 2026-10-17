import { getDesktopRuntime } from '@/runtime/desktop'
import type { WorkspaceTreeApi } from '@/types/workspaceTree'

export const workspaceTreeApi: WorkspaceTreeApi = {
  initialFile: () => getDesktopRuntime().workspaceTree.initialFile(),
  listChildren: (request) => getDesktopRuntime().workspaceTree.listChildren(request),
  onChanged: (handler) => getDesktopRuntime().workspaceTree.onChanged(handler),
  pathsExist: (request) => getDesktopRuntime().workspaceTree.pathsExist(request),
  search: (request) => getDesktopRuntime().workspaceTree.search(request),
}
