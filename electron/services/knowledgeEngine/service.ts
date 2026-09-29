import type { App } from 'electron'

import type { NativeCommandHandlers } from '@electron/ipc/commandInvoke.js'
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
  KnowledgeEngineInitializeResult,
  KnowledgeEngineStatus,
} from '@electron/services/knowledgeEngine/types.js'
import type { WorkspaceSidecarManager } from '@electron/services/knowledgeEngine/workspaceSidecarManager.js'
import type { Logger } from '@electron/services/logger.js'
import type {
  FsEntry,
  FsMarkdownDiagnostic,
  FsPathMetadata,
  FsSearchResult,
  FsSnapshot,
} from '@electron/services/workspace/types.js'
import type {
  WorkspaceSearchDocument,
  WorkspaceSearchMutationBatch,
} from '@electron/services/workspace/workspaceSearchTypes.js'
import type {
  KnowledgeSearchOptions,
  KnowledgeSearchResultSet,
} from '@electron/services/knowledgeEngine/knowledgeSearch.js'
import { workspaceStatusWorkspaceId } from '@electron/services/knowledgeEngine/workspaceStatusPayload.js'

type KnowledgeEngineServiceOptions = {
  app: App
  logger: Logger
}

export class KnowledgeEngineService {
  private sidecars: WorkspaceSidecarManager | null = null

  constructor(private readonly options: KnowledgeEngineServiceOptions) {}

  get commandHandlers(): NativeCommandHandlers {
    return {
      'knowledge.engine.status': () => this.getStatus(),
      'knowledge.engine.initialize': () => this.initialize(),
      'knowledge.engine.stop': () => this.stop(),
      'knowledge.engine.workspaceStatus': async (payload) =>
        this.getWorkspaceStatus(workspaceStatusWorkspaceId(payload)),
      'knowledge.engine.workspaces': async () => (await this.getSidecars()).listActive(),
    }
  }

  getStatus(): KnowledgeEngineStatus {
    const runtimes = this.sidecars?.listActive() ?? []
    const activeRuntime = runtimes.find((runtime) => runtime.state === 'ready') ?? runtimes[0]
    const state: KnowledgeEngineStatus['state'] = activeRuntime
      ? activeRuntime.state === 'opening'
        ? 'starting'
        : activeRuntime.state === 'closing'
          ? 'stopped'
          : activeRuntime.state
      : 'stopped'

    return {
      binaryPath: null,
      state,
      ...(activeRuntime?.pid ? { pid: activeRuntime.pid } : {}),
      ...(activeRuntime?.lastError ? { lastError: activeRuntime.lastError } : {}),
    }
  }

  async initialize(): Promise<KnowledgeEngineInitializeResult> {
    const status = this.getStatus()
    if (status.state === 'error') {
      return {
        error: status.lastError ?? 'Knowledge engine runtime is not available.',
        ok: false,
        status,
      }
    }

    return {
      ok: true,
      response: { mode: 'node-utility-process' },
      status,
    }
  }

  async openWorkspace(workspaceId: string, indexPath: string): Promise<void> {
    await (await this.getSidecars()).open(workspaceId, indexPath)
  }

  async closeWorkspace(workspaceId: string): Promise<void> {
    await (await this.getSidecars()).close(workspaceId)
  }

  async hasDocuments(workspaceId: string): Promise<boolean> {
    return (await this.getSidecars()).hasDocuments(workspaceId)
  }

  async getWorkspaceStatus(workspaceId: string): Promise<KnowledgeWorkspaceStatus> {
    return (await this.getSidecars()).getWorkspaceStatus(workspaceId)
  }

  async getWorkspaceFileSnapshot(
    workspaceId: string,
    workspaceRoot: string,
    root: FsSnapshot['root'],
  ): Promise<FsSnapshot> {
    const sidecars = await this.getSidecars()
    await sidecars.open(workspaceId, workspaceRoot, { openWorkspace: false })
    return sidecars.getWorkspaceFileSnapshot(workspaceId, root)
  }

  async listWorkspaceEntries(workspaceId: string, workspaceRoot: string): Promise<FsEntry[]> {
    const sidecars = await this.getSidecars()
    await sidecars.open(workspaceId, workspaceRoot, { openWorkspace: false })
    return sidecars.listWorkspaceEntries(workspaceId)
  }

  async readWorkspaceFile(
    workspaceId: string,
    workspaceRoot: string,
    path: string,
  ): Promise<string> {
    const sidecars = await this.getSidecars()
    await sidecars.open(workspaceId, workspaceRoot, { openWorkspace: false })
    return sidecars.readWorkspaceFile(workspaceId, path)
  }

  async writeWorkspaceFile(
    workspaceId: string,
    workspaceRoot: string,
    path: string,
    content: string,
  ): Promise<KnowledgeWorkspacePathMutation> {
    const sidecars = await this.getSidecars()
    await sidecars.open(workspaceId, workspaceRoot, { openWorkspace: false })
    return sidecars.writeWorkspaceFile(workspaceId, path, content)
  }
  async createWorkspaceFile(
    workspaceId: string,
    workspaceRoot: string,
    path: string,
  ): Promise<KnowledgeWorkspacePathMutation> {
    const sidecars = await this.getSidecars()
    await sidecars.open(workspaceId, workspaceRoot, { openWorkspace: false })
    return sidecars.createWorkspaceFile(workspaceId, path)
  }

  async createWorkspaceDirectory(
    workspaceId: string,
    workspaceRoot: string,
    path: string,
  ): Promise<KnowledgeWorkspacePathMutation> {
    const sidecars = await this.getSidecars()
    await sidecars.open(workspaceId, workspaceRoot, { openWorkspace: false })
    return sidecars.createWorkspaceDirectory(workspaceId, path)
  }

  async renameWorkspacePath(
    workspaceId: string,
    workspaceRoot: string,
    from: string,
    to: string,
  ): Promise<KnowledgeWorkspacePathMutation> {
    const sidecars = await this.getSidecars()
    await sidecars.open(workspaceId, workspaceRoot, { openWorkspace: false })
    return sidecars.renameWorkspacePath(workspaceId, from, to)
  }

  async deleteWorkspacePath(
    workspaceId: string,
    workspaceRoot: string,
    path: string,
  ): Promise<KnowledgeWorkspacePathMutation> {
    const sidecars = await this.getSidecars()
    await sidecars.open(workspaceId, workspaceRoot, { openWorkspace: false })
    return sidecars.deleteWorkspacePath(workspaceId, path)
  }

  async getWorkspacePathMetadata(
    workspaceId: string,
    workspaceRoot: string,
    path: string,
  ): Promise<FsPathMetadata> {
    const sidecars = await this.getSidecars()
    await sidecars.open(workspaceId, workspaceRoot, { openWorkspace: false })
    return sidecars.getWorkspacePathMetadata(workspaceId, path)
  }

  async rebuildIndex(workspaceId: string, documents: WorkspaceSearchDocument[]): Promise<void> {
    await (await this.getSidecars()).rebuildIndex(workspaceId, documents)
  }

  async applySearchChanges(
    workspaceId: string,
    batch: WorkspaceSearchMutationBatch,
  ): Promise<void> {
    await (await this.getSidecars()).applySearchChanges(workspaceId, batch)
  }

  async upsertDocument(workspaceId: string, document: WorkspaceSearchDocument): Promise<void> {
    await (await this.getSidecars()).upsertDocument(workspaceId, document)
  }

  async removeDocument(workspaceId: string, path: string): Promise<void> {
    await (await this.getSidecars()).removeDocument(workspaceId, path)
  }

  async removePathPrefix(workspaceId: string, prefix: string): Promise<void> {
    await (await this.getSidecars()).removePathPrefix(workspaceId, prefix)
  }

  async openMarkdownDocument(
    workspaceId: string,
    document: KnowledgeOpenDocumentInput,
  ): Promise<KnowledgeSyncResponse> {
    return (await this.getSidecars()).openMarkdownDocument(workspaceId, document)
  }

  async changeMarkdownDocument(
    workspaceId: string,
    change: KnowledgeDocumentChangeInput,
  ): Promise<KnowledgeSyncResponse> {
    return (await this.getSidecars()).changeMarkdownDocument(workspaceId, change)
  }

  async resyncMarkdownDocument(
    workspaceId: string,
    document: KnowledgeResyncDocumentInput,
  ): Promise<KnowledgeSyncResponse> {
    return (await this.getSidecars()).resyncMarkdownDocument(workspaceId, document)
  }

  async closeMarkdownDocument(
    workspaceId: string,
    document: KnowledgeCloseDocumentInput,
  ): Promise<KnowledgeSyncResponse> {
    return (await this.getSidecars()).closeMarkdownDocument(workspaceId, document)
  }

  async getMarkdownDocumentSymbols(
    workspaceId: string,
    documentId: string,
    documentVersion: number | string,
  ): Promise<KnowledgeMarkdownDocumentSymbol[]> {
    return (await this.getSidecars()).getMarkdownDocumentSymbols(
      workspaceId,
      documentId,
      documentVersion,
    )
  }

  async getMarkdownLinks(
    workspaceId: string,
    documentId: string,
    documentVersion: number | string,
  ): Promise<KnowledgeMarkdownLink[]> {
    return (await this.getSidecars()).getMarkdownLinks(workspaceId, documentId, documentVersion)
  }

  async getMarkdownDiagnostics(
    workspaceId: string,
    workspaceRoot: string,
    path: string,
    content: string,
    signal?: AbortSignal,
  ): Promise<FsMarkdownDiagnostic[]> {
    const sidecars = await this.getSidecars()
    await sidecars.open(workspaceId, workspaceRoot, { openWorkspace: false })
    return signal
      ? sidecars.getMarkdownDiagnostics(workspaceId, path, content, signal)
      : sidecars.getMarkdownDiagnostics(workspaceId, path, content)
  }

  async buildWorkspaceGraph(
    workspaceId: string,
    workspaceRoot: string,
    documents: Array<{ path: string; title?: string; content: string }>,
    knownPaths: { paths: string[]; assetPaths: string[] },
  ): Promise<KnowledgeWorkspaceGraph> {
    const sidecars = await this.getSidecars()
    await sidecars.open(workspaceId, workspaceRoot, { openWorkspace: false })
    return sidecars.buildWorkspaceGraph(workspaceId, documents, knownPaths)
  }

  async buildOutlineGraph(
    workspaceId: string,
    workspaceRoot: string,
    path: string,
    content: string,
  ): Promise<KnowledgeWorkspaceGraph> {
    const sidecars = await this.getSidecars()
    await sidecars.open(workspaceId, workspaceRoot, { openWorkspace: false })
    return sidecars.buildOutlineGraph(workspaceId, path, content)
  }
  async search(workspaceId: string, query: string, limit: number): Promise<FsSearchResult[]> {
    return (await this.getSidecars()).search(workspaceId, query, limit)
  }

  async searchWithOptions(
    workspaceId: string,
    query: string,
    options: KnowledgeSearchOptions,
  ): Promise<KnowledgeSearchResultSet> {
    return (await this.getSidecars()).searchWithOptions(workspaceId, query, options)
  }

  stop(): KnowledgeEngineStatus {
    this.sidecars?.clear()
    return this.getStatus()
  }

  dispose() {
    this.stop()
  }

  private async getSidecars(): Promise<WorkspaceSidecarManager> {
    if (this.sidecars) return this.sidecars

    const { WorkspaceSidecarManager } =
      await import('@electron/services/knowledgeEngine/workspaceSidecarManager.js')
    this.sidecars = new WorkspaceSidecarManager({
      appDataDir: this.options.app.getPath('userData'),
      logger: this.options.logger,
    })
    return this.sidecars
  }
}
