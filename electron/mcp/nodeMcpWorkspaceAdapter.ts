import fs from 'node:fs/promises'
import path from 'node:path'

import { NodeSearchIndex } from '@electron/services/knowledgeEngine/nodeSearchIndex'
import type {
  MarklabMcpSearchResultSet,
  MarklabMcpWorkspaceAdapter,
  MarklabMcpWorkspaceStatus,
} from '@electron/mcp/marklabMcpTypes'

type NodeMcpWorkspaceAdapterOptions = {
  workspaceRoot: string
  engineDataDir: string
}

export class NodeMcpWorkspaceAdapter implements MarklabMcpWorkspaceAdapter {
  private readonly searchIndex: NodeSearchIndex

  private constructor(
    private readonly workspaceRoot: string,
    private readonly engineDataDir: string,
  ) {
    this.searchIndex = new NodeSearchIndex(engineDataDir)
  }

  static async open(options: NodeMcpWorkspaceAdapterOptions): Promise<NodeMcpWorkspaceAdapter> {
    const workspaceRoot = await canonicalDirectory(options.workspaceRoot, 'workspace root')
    const engineDataDir = await canonicalDirectory(options.engineDataDir, 'engine data directory')
    return new NodeMcpWorkspaceAdapter(workspaceRoot, engineDataDir)
  }

  async getWorkspaceStatus(): Promise<MarklabMcpWorkspaceStatus> {
    const stats = await this.searchIndex.getStats()
    const documentCount = String(stats.documentCount)
    const searchIndexBytes = String(stats.indexBytes)
    return {
      workspaceRoot: this.workspaceRoot,
      engineDataDir: this.engineDataDir,
      health: {
        ok: true,
        state: 'ready',
        metadataDocuments: documentCount,
        searchableDocuments: documentCount,
        pendingOutboxEvents: '0',
        warnings: [],
      },
      index: {
        searchIndex: 'sqlite-fts5',
        ready: true,
        metadataDocuments: documentCount,
        searchableDocuments: documentCount,
        pendingOutboxEvents: '0',
      },
      storage: {
        metadataStore: 'sqlite',
        searchIndex: 'sqlite-fts5',
        metadataBytes: '0',
        searchIndexBytes,
        totalBytes: searchIndexBytes,
        metadataDocuments: documentCount,
        pendingOutboxEvents: '0',
        blobStore: false,
        blobBytes: '0',
      },
    }
  }

  async searchWorkspace(query: string, limit: number): Promise<MarklabMcpSearchResultSet> {
    const resultSet = await this.searchIndex.search(query, { limit })
    const results = resultSet.results.map((result) => ({
      documentId: result.path,
      path: result.path,
      title: result.title,
      line: result.line,
      column: result.column,
      endColumn: result.end_column,
      snippet: result.snippet,
      snippetHighlights: result.snippet_highlights,
      score: result.score,
    }))
    return {
      query,
      limit,
      totalHits: resultSet.totalHits,
      resultCount: results.length,
      results,
    }
  }

  close(): Promise<void> {
    return this.searchIndex.close()
  }
}

const canonicalDirectory = async (input: string, label: string): Promise<string> => {
  const canonicalPath = await fs.realpath(path.resolve(input))
  const metadata = await fs.stat(canonicalPath)
  if (!metadata.isDirectory()) throw new Error(`MarkLab MCP ${label} must be a directory.`)
  return canonicalPath
}
