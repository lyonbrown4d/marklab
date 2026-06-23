import type { ChildProcessWithoutNullStreams } from 'node:child_process'

import type {
  KnowledgeCloseDocumentInput,
  KnowledgeDocumentChangeInput,
  KnowledgeMarkdownDocumentSymbol,
  KnowledgeMarkdownLink,
  KnowledgeOpenDocumentInput,
  KnowledgeResyncDocumentInput,
  KnowledgeSearchOptions,
  KnowledgeSearchResultSet,
  KnowledgeSyncResponse,
} from '@electron/services/knowledgeEngine/grpcClient.js'
import {
  redactWorkspaceSidecarSpawnPlan,
  type WorkspaceSidecarSpawnPlan,
} from '@electron/services/knowledgeEngine/workspaceSidecarSpawnPlan.js'
import type { KnowledgeEngineBinaryResolution } from '@electron/services/knowledgeEngine/types.js'
import type { FsSearchResult } from '@electron/services/workspace/types.js'
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
  getMarkdownDocumentSymbols: (
    documentId: string,
    documentVersion: number | string,
  ) => Promise<KnowledgeMarkdownDocumentSymbol[]>
  getMarkdownLinks: (
    documentId: string,
    documentVersion: number | string,
  ) => Promise<KnowledgeMarkdownLink[]>
  getCapabilities: (workspaceInstanceId: string) => Promise<unknown>
  hasDocuments: () => Promise<boolean>
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
  child?: ChildProcessWithoutNullStreams
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
  resolveBinary: () => KnowledgeEngineBinaryResolution | null
  startSidecar?: (
    plan: WorkspaceSidecarSpawnPlan,
    identity: WorkspaceSidecarIdentity,
  ) => Promise<StartedWorkspaceSidecar>
}

export type StartedWorkspaceSidecar = {
  address: string
  child?: ChildProcessWithoutNullStreams
  client: WorkspaceSidecarClient
}
