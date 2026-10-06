import type { FsGraph, FsWorkspaceIndex } from '@electron/services/workspace/types'
import type { WorkspaceDocument } from '@electron/services/workspace/workspaceDocumentLoader'
import type { WorkspaceKnownPaths } from '@electron/services/workspace/workspaceUtils'

export type WorkspaceAnalysisInput = {
  documents: WorkspaceDocument[]
  knownPaths: WorkspaceKnownPaths
}

type CacheEntry<T> = {
  generation: number
  promise: Promise<T>
}

export class WorkspaceAnalysisCache {
  private generation = 0
  private input: CacheEntry<WorkspaceAnalysisInput> | null = null
  private index: CacheEntry<FsWorkspaceIndex> | null = null
  private graph: CacheEntry<FsGraph> | null = null

  getInput(load: () => Promise<WorkspaceAnalysisInput>): Promise<WorkspaceAnalysisInput> {
    return this.getOrCreate(this.input, load, (entry) => {
      this.input = entry
    })
  }

  getIndex(load: () => Promise<FsWorkspaceIndex>): Promise<FsWorkspaceIndex> {
    return this.getOrCreate(this.index, load, (entry) => {
      this.index = entry
    })
  }

  getGraph(load: () => Promise<FsGraph>): Promise<FsGraph> {
    return this.getOrCreate(this.graph, load, (entry) => {
      this.graph = entry
    })
  }

  invalidate(): void {
    this.generation += 1
    this.input = null
    this.index = null
    this.graph = null
  }

  private getOrCreate<T>(
    current: CacheEntry<T> | null,
    load: () => Promise<T>,
    assign: (entry: CacheEntry<T> | null) => void,
  ): Promise<T> {
    if (current?.generation === this.generation) return current.promise

    const generation = this.generation
    const promise = Promise.resolve().then(load)
    const entry = { generation, promise }
    assign(entry)
    void promise.catch(() => {
      if (generation === this.generation) assign(null)
    })
    return promise
  }
}
