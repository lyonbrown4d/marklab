import type {
  KnowledgeCloseDocumentInput,
  KnowledgeDocumentChangeInput,
  KnowledgeMarkdownDocumentSymbol,
  KnowledgeMarkdownLink,
  KnowledgeOpenDocumentInput,
  KnowledgeResyncDocumentInput,
  KnowledgeSyncResponse,
  KnowledgeWorkspaceGraph,
  KnowledgeWorkspaceStatus,
  KnowledgeWorkspacePathMutation,
} from '@electron/services/knowledgeEngine/knowledgeEngineTypes.js'
import type {
  KnowledgeSearchOptions,
  KnowledgeSearchResultSet,
} from '@electron/services/knowledgeEngine/knowledgeSearch.js'
import {
  redactWorkspaceSidecarSpawnPlan,
  type WorkspaceSidecarSpawnPlan,
} from '@electron/services/knowledgeEngine/workspaceSidecarSpawnPlan.js'
import type {
  FsEntry,
  FsPathMetadata,
  FsSearchResult,
  FsSnapshot,
} from '@electron/services/workspace/types.js'
import type { Logger } from '@electron/services/logger.js'
import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes.js'
import type { WorkspaceSidecarIdentity } from '@electron/services/knowledgeEngine/workspaceIdentity.js'

export type WorkspaceSidecarRuntimeState = 'opening' | 'ready' | 'closing' | 'error'

export type WorkspaceSidecarClient = {
  changeMarkdownDocument: (
    workspaceInstanceId: string,
    change: KnowledgeDocumentChangeInput,
  ) => Promise<KnowledgeSyncResponse>
  close: () => void
  closeMarkdownDocument: (
    workspaceInstanceId: string,
    document: KnowledgeCloseDocumentInput,
  ) => Promise<KnowledgeSyncResponse>
  closeWorkspace: () => Promise<void>
  createWorkspaceFile: (path: string) => Promise<KnowledgeWorkspacePathMutation>
  createWorkspaceDirectory: (path: string) => Promise<KnowledgeWorkspacePathMutation>
  renameWorkspacePath: (from: string, to: string) => Promise<KnowledgeWorkspacePathMutation>
  deleteWorkspacePath: (path: string) => Promise<KnowledgeWorkspacePathMutation>
  getMarkdownDocumentSymbols: (
    documentId: string,
    documentVersion: number | string,
  ) => Promise<KnowledgeMarkdownDocumentSymbol[]>
  getMarkdownLinks: (
    documentId: string,
    documentVersion: number | string,
  ) => Promise<KnowledgeMarkdownLink[]>
  buildOutlineGraph: (path: string, content: string) => Promise<KnowledgeWorkspaceGraph>
  buildWorkspaceGraph: (
    documents: Array<{ path: string; title?: string; content: string }>,
    knownPaths: { paths: string[]; assetPaths: string[] },
  ) => Promise<KnowledgeWorkspaceGraph>
  getCapabilities: (workspaceInstanceId: string) => Promise<unknown>
  getWorkspaceStatus: () => Promise<KnowledgeWorkspaceStatus>
  getWorkspaceFileSnapshot: (root: FsSnapshot['root']) => Promise<FsSnapshot>
  getWorkspacePathMetadata: (path: string) => Promise<FsPathMetadata>
  hasDocuments: () => Promise<boolean>
  listWorkspaceEntries: () => Promise<FsEntry[]>
  openMarkdownDocument: (
    workspaceInstanceId: string,
    document: KnowledgeOpenDocumentInput,
  ) => Promise<KnowledgeSyncResponse>
  openWorkspace: (indexPath: string) => Promise<void>
  rebuildIndex: (documents: WorkspaceSearchDocument[]) => Promise<void>
  removeDocument: (path: string) => Promise<void>
  removePathPrefix: (prefix: string) => Promise<void>
  resyncMarkdownDocument: (
    workspaceInstanceId: string,
    document: KnowledgeResyncDocumentInput,
  ) => Promise<KnowledgeSyncResponse>
  readWorkspaceFile: (path: string) => Promise<string>
  writeWorkspaceFile: (path: string, content: string) => Promise<KnowledgeWorkspacePathMutation>
  search: (query: string, limit: number) => Promise<FsSearchResult[]>
  searchWithOptions: (
    query: string,
    options: KnowledgeSearchOptions,
  ) => Promise<KnowledgeSearchResultSet>
  shutdown: (reason: string) => Promise<void>
  upsertDocument: (document: WorkspaceSearchDocument) => Promise<void>
}

export type WorkspaceSidecarRuntime = {
  workspaceId: string
  indexPath: string
  identity: WorkspaceSidecarIdentity
  spawnPlan: WorkspaceSidecarSpawnPlan
  state: WorkspaceSidecarRuntimeState
  openedAt: number
  lastActivityAt: number
  address?: string
  child?: WorkspaceSidecarProcess
  client?: WorkspaceSidecarClient
  lastError?: string
}

export type WorkspaceSidecarRuntimeSummary = Omit<
  WorkspaceSidecarRuntime,
  'child' | 'client' | 'identity' | 'spawnPlan'
> & {
  identity: Pick<
    WorkspaceSidecarIdentity,
    'canonicalRoot' | 'engineDataDir' | 'workspaceInstanceId'
  >
  pid?: number
  spawnPlan: ReturnType<typeof redactWorkspaceSidecarSpawnPlan>
}

export type WorkspaceSidecarManagerOptions = {
  appDataDir: string
  logger: Logger
  startSidecar?: (
    plan: WorkspaceSidecarSpawnPlan,
    identity: WorkspaceSidecarIdentity,
  ) => Promise<StartedWorkspaceSidecar>
}

export type StartedWorkspaceSidecar = {
  address: string
  child?: WorkspaceSidecarProcess
  client: WorkspaceSidecarClient
}

export type WorkspaceSidecarProcess = {
  killed: boolean
  kill: () => boolean
  onExit?: (listener: (code: number) => void) => void
  pid?: number
}
