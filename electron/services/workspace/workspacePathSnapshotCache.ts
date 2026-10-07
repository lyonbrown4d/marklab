import { performance } from 'node:perf_hooks'

import type { Logger } from '@electron/services/logger'
import type { FsStateData } from '@electron/services/workspace/types'
import {
  listWorkspacePathSnapshot,
  type WorkspacePathSnapshot,
} from '@electron/services/workspace/workspaceUtils'

type WorkspacePathSnapshotCacheOptions = {
  getState: () => FsStateData
  load: (state: FsStateData) => Promise<WorkspacePathSnapshot>
  logger: Logger
  now?: () => number
}

type CachedSnapshot = {
  generation: number
  request: Promise<WorkspacePathSnapshot>
}

export class WorkspacePathSnapshotCache {
  private current: CachedSnapshot | null = null
  private generation = 0
  private readonly now: () => number

  constructor(private readonly options: WorkspacePathSnapshotCacheOptions) {
    this.now = options.now ?? performance.now.bind(performance)
  }

  get(): Promise<WorkspacePathSnapshot> {
    const cached = this.current
    if (cached?.generation === this.generation) {
      this.options.logger.debug?.('workspace path snapshot reused', {
        cacheHit: true,
        generation: this.generation,
        rootKind: this.options.getState().rootKind,
      })
      return cached.request
    }

    const generation = this.generation
    const state = { ...this.options.getState() }
    const startedAt = this.now()
    const request = this.options.load(state).then((snapshot) => {
      this.options.logger.info('workspace path snapshot refreshed', {
        cacheHit: false,
        durationMs: Math.max(0, this.now() - startedAt),
        entryCount: snapshot.entries.length,
        generation,
        knownPathCount: snapshot.knownPaths.paths.length,
        rootKind: state.rootKind,
      })
      return generation === this.generation ? snapshot : this.get()
    })
    this.current = { generation, request }
    void request.catch(() => {
      if (this.current?.request === request) this.current = null
    })
    return request
  }

  invalidate(): void {
    this.generation += 1
    this.current = null
  }
}

export const createWorkspacePathSnapshotCache = (
  getState: () => FsStateData,
  logger: Logger,
): WorkspacePathSnapshotCache =>
  new WorkspacePathSnapshotCache({
    getState,
    load: listWorkspacePathSnapshot,
    logger,
  })
