export const WORKSPACE_TREE_MAX_PAGE_SIZE = 256
export const WORKSPACE_TREE_MAX_EXISTENCE_PATHS = 256
export const WORKSPACE_TREE_MAX_SEARCH_RESULTS = 100

export type WorkspaceTreeRoot = {
  kind: 'internal' | 'external' | 'single'
  path: string
}

export type WorkspaceTreeEntry = {
  kind: 'file' | 'folder'
  name: string
  path: string
  hasChildren: boolean
}

export type WorkspaceTreeChildrenRequest = {
  cursor?: string | null
  limit?: number
  parent: string | null
}

export type WorkspaceTreeChildrenResult = {
  entries: WorkspaceTreeEntry[]
  nextCursor: string | null
  parent: string
  generation: number
  revision: number
  root: WorkspaceTreeRoot
}

export type WorkspaceTreeExistenceRequest = {
  kind?: 'any' | 'file'
  paths: string[]
}
export type WorkspaceTreeExistenceResult = {
  existing: string[]
  generation: number
  revision: number
  root: WorkspaceTreeRoot
}
export type WorkspaceTreeInitialFileResult = {
  generation: number
  path: string | null
  revision: number
  root: WorkspaceTreeRoot
}
export type WorkspaceTreeSearchRequest = { query: string; limit?: number }
export type WorkspaceTreeSearchResult = {
  entries: WorkspaceTreeEntry[]
  generation: number
  revision: number
  root: WorkspaceTreeRoot
}

export type WorkspaceTreeChange =
  | { type: 'added'; entry: Omit<WorkspaceTreeEntry, 'hasChildren'> }
  | { type: 'changed'; path: string }
  | { type: 'removed'; path: string }
  | { type: 'renamed'; from: string; entry: Omit<WorkspaceTreeEntry, 'hasChildren'> }

type WorkspaceTreeEventBase = {
  generation: number
  previousRevision: number
  revision: number
  root: WorkspaceTreeRoot
}

export type WorkspaceTreeDeltaEvent =
  | (WorkspaceTreeEventBase & { kind: 'changes'; changes: WorkspaceTreeChange[] })
  | (WorkspaceTreeEventBase & { kind: 'invalidated' })

export type WorkspaceTreeApi = {
  initialFile: () => Promise<WorkspaceTreeInitialFileResult>
  listChildren: (request: WorkspaceTreeChildrenRequest) => Promise<WorkspaceTreeChildrenResult>
  onChanged: (handler: (event: WorkspaceTreeDeltaEvent) => void) => () => void
  pathsExist: (request: WorkspaceTreeExistenceRequest) => Promise<WorkspaceTreeExistenceResult>
  search: (request: WorkspaceTreeSearchRequest) => Promise<WorkspaceTreeSearchResult>
}
