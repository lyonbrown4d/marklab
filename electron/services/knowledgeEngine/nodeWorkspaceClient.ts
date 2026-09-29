import type { WorkspaceSidecarClient } from '@electron/services/knowledgeEngine/workspaceSidecarTypes.js'
import {
  buildNodeOutlineGraph,
  buildNodeWorkspaceGraph,
} from '@electron/services/knowledgeEngine/nodeGraph.js'
import { NodeMarkdownOverlay } from '@electron/services/knowledgeEngine/nodeMarkdownOverlay.js'
import { NodeSearchIndex } from '@electron/services/knowledgeEngine/nodeSearchIndex.js'
import { NodeWorkspaceVfs } from '@electron/services/knowledgeEngine/nodeWorkspaceVfs.js'

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
    this.searchIndex = new NodeSearchIndex(engineDataDir)
  }

  async getCapabilities() {
    return {
      capabilities: [
        'workspace-vfs',
        'workspace-search',
        'markdown-overlay',
        'workspace-graph',
        'outline-graph',
      ],
      engineVersion: 'node',
      protocolVersion: 'utility-process-v1',
      storage: {
        blobStore: false,
        metadataStore: 'node-json',
        searchIndex: 'node-json',
      },
    }
  }

  async openWorkspace(indexPath: string): Promise<void> {
    await this.vfs.open(indexPath)
    await this.searchIndex.getSize()
  }

  async closeWorkspace(): Promise<void> {
    this.markdown.clear()
  }

  async hasDocuments(): Promise<boolean> {
    return this.searchIndex.hasDocuments()
  }

  async getWorkspaceStatus() {
    const documents = String(await this.searchIndex.getSize())
    return {
      health: {
        metadataDocuments: documents,
        ok: true,
        pendingOutboxEvents: '0',
        searchableDocuments: documents,
        state: 'ready',
        warnings: [],
      },
      index: {
        metadataDocuments: documents,
        pendingOutboxEvents: '0',
        ready: true,
        searchableDocuments: documents,
        searchIndex: 'node-json',
      },
      storage: {
        blobBytes: '0',
        blobStore: false,
        metadataBytes: '0',
        metadataDocuments: documents,
        metadataStore: 'node-json',
        pendingOutboxEvents: '0',
        searchIndex: 'node-json',
        searchIndexBytes: '0',
        totalBytes: '0',
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

  async removeDocument(path: string): Promise<void> {
    await this.searchIndex.remove(path)
  }

  async removePathPrefix(prefix: string): Promise<void> {
    await this.searchIndex.removePrefix(prefix)
  }

  async search(query: string, limit: number) {
    return (await this.searchIndex.search(query, { limit })).results
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

  async buildWorkspaceGraph(
    documents: Parameters<typeof buildNodeWorkspaceGraph>[0],
    knownPaths: Parameters<typeof buildNodeWorkspaceGraph>[1],
  ) {
    return buildNodeWorkspaceGraph(documents, knownPaths)
  }

  async buildOutlineGraph(path: string, content: string) {
    return buildNodeOutlineGraph(path, content)
  }

  async shutdown(): Promise<void> {
    this.markdown.clear()
  }

  close(): void {
    this.markdown.clear()
  }
}
