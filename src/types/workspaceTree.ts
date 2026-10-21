import type {
  DesktopCommandArgs,
  DesktopCommandResults,
  DesktopEventPayloads,
} from '@/generated/desktop/bindings'

export const WORKSPACE_TREE_MAX_PAGE_SIZE = 256
export const WORKSPACE_TREE_MAX_EXISTENCE_PATHS = 256
export const WORKSPACE_TREE_MAX_SEARCH_RESULTS = 100

export type WorkspaceTreeChildrenRequest =
  DesktopCommandArgs['workspace_tree_list_children']['request']
export type WorkspaceTreeChildrenResult = DesktopCommandResults['workspace_tree_list_children']
export type WorkspaceTreeEntry = WorkspaceTreeChildrenResult['entries'][number]
export type WorkspaceTreeRoot = WorkspaceTreeChildrenResult['root']
export type WorkspaceTreeExistenceRequest =
  DesktopCommandArgs['workspace_tree_paths_exist']['request']
export type WorkspaceTreeExistenceResult = DesktopCommandResults['workspace_tree_paths_exist']
export type WorkspaceTreeInitialFileResult = DesktopCommandResults['workspace_tree_initial_file']
export type WorkspaceTreeSearchRequest = DesktopCommandArgs['workspace_tree_search']['request']
export type WorkspaceTreeSearchResult = DesktopCommandResults['workspace_tree_search']
export type WorkspaceTreeDeltaEvent = DesktopEventPayloads['workspace-tree-changed']
export type WorkspaceTreeChange = Extract<
  WorkspaceTreeDeltaEvent,
  { kind: 'changes' }
>['changes'][number]

export type WorkspaceTreeApi = {
  initialFile: () => Promise<WorkspaceTreeInitialFileResult>
  listChildren: (request: WorkspaceTreeChildrenRequest) => Promise<WorkspaceTreeChildrenResult>
  onChanged: (handler: (event: WorkspaceTreeDeltaEvent) => void) => () => void
  pathsExist: (request: WorkspaceTreeExistenceRequest) => Promise<WorkspaceTreeExistenceResult>
  search: (request: WorkspaceTreeSearchRequest) => Promise<WorkspaceTreeSearchResult>
}
