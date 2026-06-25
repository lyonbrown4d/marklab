import type {
  WorkspaceSidecarClient,
  WorkspaceSidecarManagerOptions,
  WorkspaceSidecarRuntime,
  WorkspaceSidecarRuntimeSummary,
} from '@electron/services/knowledgeEngine/workspaceSidecarTypes.js'
import { openWorkspaceSidecarRuntime } from '@electron/services/knowledgeEngine/workspaceSidecarOpen.js'
import { summarizeWorkspaceSidecarRuntimes } from '@electron/services/knowledgeEngine/workspaceSidecarRuntimeSummary.js'
import type {
  KnowledgeSearchOptions,
  KnowledgeSearchResultSet,
} from '@electron/services/knowledgeEngine/knowledgeSearch.js'
import type {
  FsEntry,
  FsPathMetadata,
  FsSearchResult,
  FsSnapshot,
} from '@electron/services/workspace/types.js'
import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes.js'
import {
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
} from '@electron/services/knowledgeEngine/grpcClient.js'

export type {
  WorkspaceSidecarClient,
  StartedWorkspaceSidecar,
  WorkspaceSidecarRuntimeSummary,
} from '@electron/services/knowledgeEngine/workspaceSidecarTypes.js'

export class WorkspaceSidecarManager {
  private readonly runtimes = new Map<string, WorkspaceSidecarRuntime>()

  constructor(private readonly options: WorkspaceSidecarManagerOptions) {}

  listActive(): WorkspaceSidecarRuntimeSummary[] {
    return summarizeWorkspaceSidecarRuntimes(this.runtimes.values())
  }

  async open(
    workspaceId: string,
    indexPath: string,
    options: { openWorkspace?: boolean } = {},
  ): Promise<void> {
    await openWorkspaceSidecarRuntime({
      workspaceId,
      indexPath,
      openWorkspace: options.openWorkspace,
      runtimes: this.runtimes,
      options: this.options,
      close: (id) => this.close(id),
    })
  }

  async close(workspaceId: string): Promise<void> {
    const runtime = this.runtimes.get(workspaceId)
    if (!runtime) return

    this.runtimes.set(workspaceId, {
      ...runtime,
      state: 'closing',
      lastActivityAt: Date.now(),
    })

    try {
      await runtime.client?.closeWorkspace()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.options.logger.warn(
        `[knowledge-engine] Failed to close workspace ${workspaceId}: ${message}`,
      )
    } finally {
      await runtime.client?.shutdown('workspace closed').catch(() => undefined)
      runtime.client?.close()
      if (runtime.child && !runtime.child.killed) {
        runtime.child.kill()
      }
      this.runtimes.delete(workspaceId)
    }
  }

  async hasDocuments(workspaceId: string): Promise<boolean> {
    return this.requireReady(workspaceId).client.hasDocuments()
  }

  async getWorkspaceStatus(workspaceId: string): Promise<KnowledgeWorkspaceStatus> {
    return this.requireReady(workspaceId).client.getWorkspaceStatus()
  }

  async getWorkspaceFileSnapshot(
    workspaceId: string,
    root: FsSnapshot['root'],
  ): Promise<FsSnapshot> {
    return this.requireReady(workspaceId).client.getWorkspaceFileSnapshot(root)
  }

  async listWorkspaceEntries(workspaceId: string): Promise<FsEntry[]> {
    return this.requireReady(workspaceId).client.listWorkspaceEntries()
  }

  async readWorkspaceFile(workspaceId: string, path: string): Promise<string> {
    return this.requireReady(workspaceId).client.readWorkspaceFile(path)
  }

  async writeWorkspaceFile(
    workspaceId: string,
    path: string,
    content: string,
  ): Promise<KnowledgeWorkspacePathMutation> {
    return this.requireReady(workspaceId).client.writeWorkspaceFile(path, content)
  }
  async createWorkspaceFile(
    workspaceId: string,
    path: string,
  ): Promise<KnowledgeWorkspacePathMutation> {
    return this.requireReady(workspaceId).client.createWorkspaceFile(path)
  }

  async createWorkspaceDirectory(
    workspaceId: string,
    path: string,
  ): Promise<KnowledgeWorkspacePathMutation> {
    return this.requireReady(workspaceId).client.createWorkspaceDirectory(path)
  }

  async renameWorkspacePath(
    workspaceId: string,
    from: string,
    to: string,
  ): Promise<KnowledgeWorkspacePathMutation> {
    return this.requireReady(workspaceId).client.renameWorkspacePath(from, to)
  }

  async deleteWorkspacePath(
    workspaceId: string,
    path: string,
  ): Promise<KnowledgeWorkspacePathMutation> {
    return this.requireReady(workspaceId).client.deleteWorkspacePath(path)
  }

  async getWorkspacePathMetadata(workspaceId: string, path: string): Promise<FsPathMetadata> {
    return this.requireReady(workspaceId).client.getWorkspacePathMetadata(path)
  }

  async rebuildIndex(workspaceId: string, documents: WorkspaceSearchDocument[]): Promise<void> {
    await this.requireReady(workspaceId).client.rebuildIndex(documents)
  }

  async upsertDocument(workspaceId: string, document: WorkspaceSearchDocument): Promise<void> {
    await this.requireReady(workspaceId).client.upsertDocument(document)
  }

  async removeDocument(workspaceId: string, path: string): Promise<void> {
    await this.requireReady(workspaceId).client.removeDocument(path)
  }

  async removePathPrefix(workspaceId: string, prefix: string): Promise<void> {
    await this.requireReady(workspaceId).client.removePathPrefix(prefix)
  }

  async openMarkdownDocument(
    workspaceId: string,
    document: KnowledgeOpenDocumentInput,
  ): Promise<KnowledgeSyncResponse> {
    const runtime = this.requireReady(workspaceId)
    return runtime.client.openMarkdownDocument(runtime.identity.workspaceInstanceId, document)
  }

  async changeMarkdownDocument(
    workspaceId: string,
    change: KnowledgeDocumentChangeInput,
  ): Promise<KnowledgeSyncResponse> {
    const runtime = this.requireReady(workspaceId)
    return runtime.client.changeMarkdownDocument(runtime.identity.workspaceInstanceId, change)
  }

  async resyncMarkdownDocument(
    workspaceId: string,
    document: KnowledgeResyncDocumentInput,
  ): Promise<KnowledgeSyncResponse> {
    const runtime = this.requireReady(workspaceId)
    return runtime.client.resyncMarkdownDocument(runtime.identity.workspaceInstanceId, document)
  }

  async closeMarkdownDocument(
    workspaceId: string,
    document: KnowledgeCloseDocumentInput,
  ): Promise<KnowledgeSyncResponse> {
    const runtime = this.requireReady(workspaceId)
    return runtime.client.closeMarkdownDocument(runtime.identity.workspaceInstanceId, document)
  }

  async getMarkdownDocumentSymbols(
    workspaceId: string,
    documentId: string,
    documentVersion: number | string,
  ): Promise<KnowledgeMarkdownDocumentSymbol[]> {
    return this.requireReady(workspaceId).client.getMarkdownDocumentSymbols(
      documentId,
      documentVersion,
    )
  }

  async getMarkdownLinks(
    workspaceId: string,
    documentId: string,
    documentVersion: number | string,
  ): Promise<KnowledgeMarkdownLink[]> {
    return this.requireReady(workspaceId).client.getMarkdownLinks(documentId, documentVersion)
  }

  async buildWorkspaceGraph(
    workspaceId: string,
    documents: Array<{ path: string; title?: string; content: string }>,
    knownPaths: { paths: string[]; assetPaths: string[] },
  ): Promise<KnowledgeWorkspaceGraph> {
    return this.requireReady(workspaceId).client.buildWorkspaceGraph(documents, knownPaths)
  }

  async buildOutlineGraph(
    workspaceId: string,
    path: string,
    content: string,
  ): Promise<KnowledgeWorkspaceGraph> {
    return this.requireReady(workspaceId).client.buildOutlineGraph(path, content)
  }

  async search(workspaceId: string, query: string, limit: number): Promise<FsSearchResult[]> {
    return this.requireReady(workspaceId).client.search(query, limit)
  }

  async searchWithOptions(
    workspaceId: string,
    query: string,
    options: KnowledgeSearchOptions,
  ): Promise<KnowledgeSearchResultSet> {
    return this.requireReady(workspaceId).client.searchWithOptions(query, options)
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.runtimes.keys()].map((workspaceId) => this.close(workspaceId)))
  }

  clear(): void {
    for (const runtime of this.runtimes.values()) {
      runtime.client?.close()
      if (runtime.child && !runtime.child.killed) {
        runtime.child.kill()
      }
    }
    this.runtimes.clear()
  }

  private requireReady(
    workspaceId: string,
  ): WorkspaceSidecarRuntime & { client: WorkspaceSidecarClient } {
    const runtime = this.runtimes.get(workspaceId)
    if (!runtime?.client || runtime.state !== 'ready') {
      throw new Error(`Knowledge sidecar workspace is not ready: ${workspaceId}`)
    }

    runtime.lastActivityAt = Date.now()
    return runtime as WorkspaceSidecarRuntime & { client: WorkspaceSidecarClient }
  }
}
