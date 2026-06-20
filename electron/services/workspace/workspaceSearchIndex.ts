import path from 'node:path'
import { promises as fs } from 'node:fs'
import type { FsSearchResult } from '@electron/services/workspace/types.js'
import { isMarkdownPath } from '@electron/services/workspace/path.js'
import { WorkspaceNativeSearchBackend } from '@electron/services/workspace/workspaceNativeSearchBackend.js'
import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes.js'

const MAX_SEARCH_LIMIT = 100

export type { WorkspaceSearchDocument }

export class WorkspaceSearchIndex {
  private indexPath: string | null = null
  private nativeBackend = new WorkspaceNativeSearchBackend()

  async open(indexPath: string): Promise<void> {
    const normalizedPath = path.resolve(indexPath)
    const nativeIndexPath = normalizedPath
    if (nativeIndexPath === this.indexPath) return

    await this.close()
    await fs.mkdir(nativeIndexPath, { recursive: true })
    if (!this.nativeBackend.open(nativeIndexPath)) {
      throw new Error('Native Tantivy search module is unavailable.')
    }
    this.indexPath = nativeIndexPath
  }

  async close(): Promise<void> {
    this.nativeBackend.close()
    this.indexPath = null
  }

  async hasDocuments(): Promise<boolean> {
    return this.nativeBackend.hasDocuments() ?? false
  }

  async rebuild(documents: WorkspaceSearchDocument[]): Promise<void> {
    const indexable = documents.filter((document) => isMarkdownPath(document.path))
    this.requireNativeOperation(this.nativeBackend.rebuild(indexable))
  }

  async upsertDocument(document: WorkspaceSearchDocument): Promise<void> {
    if (!isMarkdownPath(document.path)) return
    this.requireNativeOperation(this.nativeBackend.upsertDocument(document))
  }

  async removeDocument(pathValue: string): Promise<void> {
    this.requireNativeOperation(this.nativeBackend.removeDocument(pathValue))
  }

  async removePathPrefix(prefix: string): Promise<void> {
    this.requireNativeOperation(this.nativeBackend.removePathPrefix(prefix))
  }

  async search(query: string, limit: number): Promise<FsSearchResult[]> {
    if (!query.trim()) return []
    const finalLimit = Math.min(Math.max(Math.trunc(limit), 1), MAX_SEARCH_LIMIT)
    const nativeResults = this.nativeBackend.search(query, finalLimit)
    if (!nativeResults) throw new Error('Native Tantivy search index is not opened.')
    return nativeResults
  }

  private requireNativeOperation(succeeded: boolean): void {
    if (!succeeded) throw new Error('Native Tantivy search index is not opened.')
  }
}
