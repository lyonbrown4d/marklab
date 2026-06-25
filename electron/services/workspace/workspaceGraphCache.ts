import { createHash, type Hash } from 'node:crypto'

import type { FsGraph } from '@electron/services/workspace/types.js'

type WorkspaceGraphDocument = {
  path: string
  content: string
}

type WorkspaceGraphKnownPaths = {
  paths: string[]
  assetPaths: string[]
}

const DEFAULT_MAX_CACHE_ENTRIES = 8

export class WorkspaceGraphCache {
  constructor(private readonly maxEntries = DEFAULT_MAX_CACHE_ENTRIES) {}

  private readonly workspaceGraphs = new Map<string, FsGraph>()
  private readonly outlineGraphs = new Map<string, FsGraph>()

  getWorkspaceGraph(
    documents: WorkspaceGraphDocument[],
    knownPaths: WorkspaceGraphKnownPaths,
  ): FsGraph | undefined {
    return this.getGraph(this.workspaceGraphs, this.workspaceGraphKey(documents, knownPaths))
  }

  setWorkspaceGraph(
    documents: WorkspaceGraphDocument[],
    knownPaths: WorkspaceGraphKnownPaths,
    graph: FsGraph,
  ): void {
    this.setGraph(this.workspaceGraphs, this.workspaceGraphKey(documents, knownPaths), graph)
  }

  getOutlineGraph(path: string, content: string): FsGraph | undefined {
    return this.getGraph(this.outlineGraphs, this.outlineGraphKey(path, content))
  }

  setOutlineGraph(path: string, content: string, graph: FsGraph): void {
    this.setGraph(this.outlineGraphs, this.outlineGraphKey(path, content), graph)
  }

  clear(): void {
    this.workspaceGraphs.clear()
    this.outlineGraphs.clear()
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

  private outlineGraphKey(path: string, content: string): string {
    const hash = createHash('sha256')
    appendPart(hash, 'outline')
    appendPart(hash, path)
    appendPart(hash, contentHash(content))
    return hash.digest('hex')
  }

  private getGraph(cache: Map<string, FsGraph>, key: string): FsGraph | undefined {
    const graph = cache.get(key)
    if (!graph) return undefined

    cache.delete(key)
    cache.set(key, graph)
    return graph
  }

  private setGraph(cache: Map<string, FsGraph>, key: string, graph: FsGraph): void {
    if (this.maxEntries <= 0) return

    cache.delete(key)
    cache.set(key, graph)

    while (cache.size > this.maxEntries) {
      const oldestKey = cache.keys().next().value
      if (typeof oldestKey !== 'string') return
      cache.delete(oldestKey)
    }
  }
}

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
