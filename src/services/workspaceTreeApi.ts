import { getElectronRuntime } from '@/runtime/electron'
import type { WorkspaceTreeApi } from '@/types/workspaceTree'

export const workspaceTreeApi: WorkspaceTreeApi = {
  initialFile: () => getElectronRuntime().workspaceTree.initialFile(),
  listChildren: (request) => getElectronRuntime().workspaceTree.listChildren(request),
  onChanged: (handler) => getElectronRuntime().workspaceTree.onChanged(handler),
  pathsExist: (request) => getElectronRuntime().workspaceTree.pathsExist(request),
  search: (request) => getElectronRuntime().workspaceTree.search(request),
}
