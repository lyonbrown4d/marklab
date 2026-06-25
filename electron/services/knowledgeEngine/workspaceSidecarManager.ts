import type {
  StartedWorkspaceSidecar,
  WorkspaceSidecarClient,
  WorkspaceSidecarManagerOptions,
  WorkspaceSidecarRuntime,
  WorkspaceSidecarRuntimeSummary,
} from '@electron/services/knowledgeEngine/workspaceSidecarTypes.js'
import {
  createWorkspaceSidecarIdentity,
  type WorkspaceSidecarIdentity,
} from '@electron/services/knowledgeEngine/workspaceIdentity.js'
import {
  createWorkspaceSidecarSpawnPlan,
  redactWorkspaceSidecarSpawnPlan,
  type WorkspaceSidecarSpawnPlan,
} from '@electron/services/knowledgeEngine/workspaceSidecarSpawnPlan.js'
import { startGrpcSidecar } from '@electron/services/knowledgeEngine/workspaceSidecarStarter.js'
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
    return [...this.runtimes.values()].map((runtime) => ({
      address: runtime.address,
      identity: {
        canonicalRoot: runtime.identity.canonicalRoot,
        engineDataDir: runtime.identity.engineDataDir,
        workspaceInstanceId: runtime.identity.workspaceInstanceId,
      },
      indexPath: runtime.indexPath,
      lastActivityAt: runtime.lastActivityAt,
      lastError: runtime.lastError,
      openedAt: runtime.openedAt,
      pid: runtime.child?.pid,
      spawnPlan: redactWorkspaceSidecarSpawnPlan(runtime.spawnPlan),
      state: runtime.state,
      workspaceId: runtime.workspaceId,
    }))
  }

  async open(
    workspaceId: string,
    indexPath: string,
    options: { openWorkspace?: boolean } = {},
  ): Promise<void> {
    const existing = this.runtimes.get(workspaceId)
    if (existing?.indexPath === indexPath && existing.state === 'ready') {
      existing.lastActivityAt = Date.now()
      return
    }

    if (existing) {
      await this.close(workspaceId)
    }

    const now = Date.now()
    const identity = createWorkspaceSidecarIdentity({
      appDataDir: this.options.appDataDir,
      workspaceId,
      indexPath,
    })
    const spawnPlan = this.createSpawnPlan(identity)
    const openingRuntime: WorkspaceSidecarRuntime = {
      workspaceId,
      indexPath,
      identity,
      spawnPlan,
      state: 'opening',
      openedAt: now,
      lastActivityAt: now,
    }
    this.runtimes.set(workspaceId, openingRuntime)

    try {
      const started = await this.startSidecar(spawnPlan, identity)
      await started.client.getCapabilities(identity.workspaceInstanceId)
      if (options.openWorkspace ?? true) {
        await started.client.openWorkspace(indexPath)
      }
      this.runtimes.set(workspaceId, {
        ...openingRuntime,
        address: started.address,
        child: started.child,
        client: started.client,
        lastActivityAt: Date.now(),
        state: 'ready',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.runtimes.set(workspaceId, {
        ...openingRuntime,
        lastActivityAt: Date.now(),
        lastError: message,
        state: 'error',
      })
      throw error
    }
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

  private createSpawnPlan(identity: WorkspaceSidecarIdentity): WorkspaceSidecarSpawnPlan {
    const binary = this.options.resolveBinary()
    if (!binary?.exists) {
      throw new Error('Knowledge engine binary not found. Run pnpm knowledge:build first.')
    }

    return createWorkspaceSidecarSpawnPlan({
      binary,
      identity,
    })
  }

  private startSidecar(
    plan: WorkspaceSidecarSpawnPlan,
    identity: WorkspaceSidecarIdentity,
  ): Promise<StartedWorkspaceSidecar> {
    return this.options.startSidecar
      ? this.options.startSidecar(plan, identity)
      : startGrpcSidecar(plan, identity, this.options.logger)
  }
}
