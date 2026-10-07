import type { WorkspaceSidecarClient } from '@electron/services/knowledgeEngine/workspaceSidecarTypes'
import { buildNodeWorkspaceGraph } from '@electron/services/knowledgeEngine/nodeGraph'
import { NodeMarkdownOverlay } from '@electron/services/knowledgeEngine/nodeMarkdownOverlay'
import { NodeSearchIndex } from '@electron/services/knowledgeEngine/nodeSearchIndex'
import { NodeWorkspaceVfs } from '@electron/services/knowledgeEngine/nodeWorkspaceVfs'
import { computeMicrosoftReferenceDiagnostics } from '@electron/services/markdownLanguage/microsoftDiagnostics'

export const createNodeWorkspaceClient = (
  workspaceRoot: string,
  engineDataDir?: string,
): WorkspaceSidecarClient => new NodeWorkspaceClient(workspaceRoot, engineDataDir)

class NodeWorkspaceClient implements WorkspaceSidecarClient {
  private readonly markdown = new NodeMarkdownOverlay()
  private readonly searchIndex: NodeSearchIndex
  private readonly vfs: NodeWorkspaceVfs

  constructor(workspaceRoot: string, engineDataDir?: string) {
    this.vfs = new NodeWorkspaceVfs(workspaceRoot)
    this.searchIndex = new NodeSearchIndex(engineDataDir, workspaceRoot)
  }

  async getCapabilities() {
    return {
      capabilities: [
        'workspace-vfs',
        'workspace-search',
        'markdown-overlay',
        'workspace-graph',
        'markdown-reference-diagnostics',
      ],
      engineVersion: 'node',
      protocolVersion: 'utility-process-v1',
      storage: {
        blobStore: false,
        metadataStore: 'node-json',
        searchIndex: 'sqlite-fts5',
      },
    }
  }

  async openWorkspace(indexPath: string): Promise<void> {
    await this.vfs.open(indexPath)
    await this.searchIndex.getSize()
  }

  async closeWorkspace(): Promise<void> {
    await this.searchIndex.close()
    this.markdown.clear()
  }

  async hasDocuments(): Promise<boolean> {
    return this.searchIndex.hasDocuments()
  }

  async getWorkspaceStatus() {
    const stats = await this.searchIndex.getStats()
    const documents = String(stats.documentCount)
    const latestError = stats.lastBuildError ?? stats.lastError
    return {
      health: {
        metadataDocuments: documents,
        ok: !latestError,
        pendingOutboxEvents: '0',
        searchableDocuments: documents,
        state: stats.building ? 'building' : latestError ? 'degraded' : 'ready',
        warnings: latestError ? [latestError] : [],
      },
      index: {
        metadataDocuments: documents,
        pendingOutboxEvents: '0',
        ready: !stats.building && !latestError,
        searchableDocuments: documents,
        searchIndex: 'sqlite-fts5',
        building: stats.building,
        updatedAt: stats.updatedAt,
        lastBuildDurationMs: stats.lastBuildDurationMs,
        lastBuildError: stats.lastBuildError,
        lastError: stats.lastError,
      },
      storage: {
        blobBytes: '0',
        blobStore: false,
        metadataBytes: '0',
        metadataDocuments: documents,
        metadataStore: 'node-json',
        pendingOutboxEvents: '0',
        searchIndex: 'sqlite-fts5',
        searchIndexBytes: String(stats.indexBytes),
        totalBytes: String(stats.indexBytes),
      },
    }
  }

  getWorkspaceFileSnapshot(root: Parameters<NodeWorkspaceVfs['snapshot']>[0]) {
    return this.vfs.snapshot(root)
  }

  listWorkspaceEntries() {
    return this.vfs.entries()
  }

  readWorkspaceFile(path: string) {
    return this.vfs.read(path)
  }

  writeWorkspaceFile(path: string, content: string) {
    return this.vfs.write(path, content)
  }

  createWorkspaceFile(path: string) {
    return this.vfs.createFile(path)
  }

  createWorkspaceDirectory(path: string) {
    return this.vfs.createDirectory(path)
  }

  renameWorkspacePath(from: string, to: string) {
    return this.vfs.rename(from, to)
  }

  deleteWorkspacePath(path: string) {
    return this.vfs.delete(path)
  }

  getWorkspacePathMetadata(path: string) {
    return this.vfs.metadata(path)
  }

  async rebuildIndex(documents: Parameters<NodeSearchIndex['rebuild']>[0]): Promise<void> {
    await this.searchIndex.rebuild(documents)
  }

  async upsertDocument(document: Parameters<NodeSearchIndex['upsert']>[0]): Promise<void> {
    await this.searchIndex.upsert(document)
  }

  async applySearchChanges(batch: Parameters<NodeSearchIndex['applyBatch']>[0]): Promise<void> {
    await this.searchIndex.applyBatch(batch)
  }

  async removeDocument(path: string): Promise<void> {
    await this.searchIndex.remove(path)
  }

  async removePathPrefix(prefix: string): Promise<void> {
    await this.searchIndex.removePrefix(prefix)
  }

  async search(query: string, limit: number) {
    return (await this.searchIndex.search(query, { limit })).results
  }

  searchOccurrences(
    request: Parameters<NodeSearchIndex['searchOccurrences']>[0],
    signal?: AbortSignal,
  ) {
    return this.searchIndex.searchOccurrences(request, signal)
  }

  async searchWithOptions(query: string, options: Parameters<NodeSearchIndex['search']>[1]) {
    return this.searchIndex.search(query, options)
  }

  async openMarkdownDocument(
    _workspaceInstanceId: string,
    document: Parameters<NodeMarkdownOverlay['open']>[0],
  ) {
    return this.markdown.open(document)
  }

  async changeMarkdownDocument(
    _workspaceInstanceId: string,
    change: Parameters<NodeMarkdownOverlay['change']>[0],
  ) {
    return this.markdown.change(change)
  }

  async resyncMarkdownDocument(
    _workspaceInstanceId: string,
    document: Parameters<NodeMarkdownOverlay['resync']>[0],
  ) {
    return this.markdown.resync(document)
  }

  async closeMarkdownDocument(_workspaceInstanceId: string, document: { documentId: string }) {
    return this.markdown.close(document.documentId)
  }

  async getMarkdownDocumentSymbols(documentId: string, version: number | string) {
    return this.markdown.symbols(documentId, version)
  }

  async getMarkdownLinks(documentId: string, version: number | string) {
    return this.markdown.links(documentId, version)
  }

  async getMarkdownDiagnostics(path: string, content: string, signal?: AbortSignal) {
    return computeMicrosoftReferenceDiagnostics({ content, path }, { signal })
  }

  async buildWorkspaceGraph(
    documents: Parameters<typeof buildNodeWorkspaceGraph>[0],
    knownPaths: Parameters<typeof buildNodeWorkspaceGraph>[1],
  ) {
    return buildNodeWorkspaceGraph(documents, knownPaths)
  }

  async shutdown(): Promise<void> {
    await this.searchIndex.close()
    this.markdown.clear()
  }

  close(): void {
    void this.searchIndex.close()
    this.markdown.clear()
  }
}
