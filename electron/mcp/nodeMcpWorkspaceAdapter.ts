import fs from 'node:fs/promises'
import path from 'node:path'

import { NodeSearchIndex } from '@electron/services/knowledgeEngine/nodeSearchIndex.js'
import type {
  MarklabMcpSearchResultSet,
  MarklabMcpWorkspaceAdapter,
  MarklabMcpWorkspaceStatus,
} from '@electron/mcp/marklabMcpTypes.js'

type NodeMcpWorkspaceAdapterOptions = {
  workspaceRoot: string
  engineDataDir: string
}

const SEARCH_SNAPSHOT_FILES = [
  'search-index-v2.json',
  'search-index-v2.backup.json',
  'search-index-v1.json',
]

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
    const documentCount = String(await this.searchIndex.getSize())
    const searchIndexBytes = String(await totalSnapshotBytes(this.engineDataDir))
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
        searchIndex: 'node-json',
        ready: true,
        metadataDocuments: documentCount,
        searchableDocuments: documentCount,
        pendingOutboxEvents: '0',
      },
      storage: {
        metadataStore: 'node-json',
        searchIndex: 'node-json',
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
}

const canonicalDirectory = async (input: string, label: string): Promise<string> => {
  const canonicalPath = await fs.realpath(path.resolve(input))
  const metadata = await fs.stat(canonicalPath)
  if (!metadata.isDirectory()) throw new Error(`MarkLab MCP ${label} must be a directory.`)
  return canonicalPath
}

const totalSnapshotBytes = async (engineDataDir: string): Promise<number> => {
  const sizes = await Promise.all(
    SEARCH_SNAPSHOT_FILES.map(async (fileName) => {
      try {
        return (await fs.stat(path.join(engineDataDir, fileName))).size
      } catch (error) {
        if (isErrorCode(error, 'ENOENT')) return 0
        throw error
      }
    }),
  )
  return sizes.reduce((total, size) => total + size, 0)
}

const isErrorCode = (error: unknown, code: string): boolean =>
  error instanceof Error && 'code' in error && error.code === code
