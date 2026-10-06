import { createHash, type Hash } from 'node:crypto'
import { LRUCache } from 'lru-cache'

import type { FsGraph } from '@electron/services/workspace/types'

type WorkspaceGraphDocument = {
  path: string
  content: string
}

type WorkspaceGraphKnownPaths = {
  paths: string[]
  assetPaths: string[]
}

type GraphCache = LRUCache<string, FsGraph>

const DEFAULT_MAX_CACHE_ENTRIES = 8

export class WorkspaceGraphCache {
  private readonly workspaceGraphs: GraphCache

  constructor(private readonly maxEntries = DEFAULT_MAX_CACHE_ENTRIES) {
    this.workspaceGraphs = createGraphCache(maxEntries)
  }

  getWorkspaceGraph(
    documents: WorkspaceGraphDocument[],
    knownPaths: WorkspaceGraphKnownPaths,
  ): FsGraph | undefined {
    return this.getWorkspaceGraphByKey(this.createWorkspaceGraphKey(documents, knownPaths))
  }

  setWorkspaceGraph(
    documents: WorkspaceGraphDocument[],
    knownPaths: WorkspaceGraphKnownPaths,
    graph: FsGraph,
  ): void {
    this.setWorkspaceGraphByKey(this.createWorkspaceGraphKey(documents, knownPaths), graph)
  }

  createWorkspaceGraphKey(
    documents: WorkspaceGraphDocument[],
    knownPaths: WorkspaceGraphKnownPaths,
  ): string {
    return this.workspaceGraphKey(documents, knownPaths)
  }

  getWorkspaceGraphByKey(key: string): FsGraph | undefined {
    return this.getGraph(this.workspaceGraphs, key)
  }

  setWorkspaceGraphByKey(key: string, graph: FsGraph): void {
    this.setGraph(this.workspaceGraphs, key, graph)
  }

  clear(): void {
    this.workspaceGraphs.clear()
  }

  private workspaceGraphKey(
    documents: WorkspaceGraphDocument[],
    knownPaths: WorkspaceGraphKnownPaths,
  ): string {
    const hash = createHash('sha256')
    appendPart(hash, 'workspace')

    const sortedDocuments = [...documents].sort((left, right) =>
      compareString(left.path, right.path),
    )
    for (const document of sortedDocuments) {
      appendPart(hash, document.path)
      appendPart(hash, contentHash(document.content))
    }

    appendKnownPaths(hash, 'paths', knownPaths.paths)
    appendKnownPaths(hash, 'assetPaths', knownPaths.assetPaths)

    return hash.digest('hex')
  }

  private getGraph(cache: GraphCache, key: string): FsGraph | undefined {
    return cache.get(key)
  }

  private setGraph(cache: GraphCache, key: string, graph: FsGraph): void {
    if (this.maxEntries <= 0) return

    cache.set(key, graph)
  }
}

const createGraphCache = (maxEntries: number): GraphCache =>
  new LRUCache<string, FsGraph>({ max: Math.max(1, Math.floor(maxEntries)) })

const appendKnownPaths = (hash: Hash, label: string, paths: string[]): void => {
  appendPart(hash, label)
  for (const pathValue of [...paths].sort(compareString)) {
    appendPart(hash, pathValue)
  }
}

const appendPart = (hash: Hash, value: string): void => {
  hash.update(`${value.length}:`)
  hash.update(value)
  hash.update('|')
}

const contentHash = (content: string): string => createHash('sha256').update(content).digest('hex')

const compareString = (left: string, right: string): number => left.localeCompare(right)
