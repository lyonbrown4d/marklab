import fs from 'node:fs'

import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service'
import type { Logger } from '@electron/services/logger'
import type { FsStateData } from '@electron/services/workspace/types'
import type { WorkspaceBufferStore } from '@electron/services/workspace/workspaceBuffers'
import { trySidecarReadFile } from '@electron/services/workspace/workspaceSidecarFileBridge'
import type { FsBufferSnapshot } from '@/services/fsBufferSchemas'

type WorkspaceFileReaderOptions = {
  buffers: Pick<
    WorkspaceBufferStore,
    'cacheCleanFile' | 'getStatus' | 'readCached' | 'reconcilePersistedRead'
  >
  getState: () => FsStateData
  getSessionGeneration?: () => number
  assertCurrentRoot?: (state: FsStateData) => void
  knowledgeEngineService?: KnowledgeEngineService
  logger: Logger
  resolvePath: (relativePath: string) => string
}

export class WorkspaceFileReader {
  constructor(private readonly options: WorkspaceFileReaderOptions) {}

  readonly open = (relativePath: string): Promise<string> =>
    this.load(relativePath, true, (content) => content)

  readonly openSnapshot = (relativePath: string): Promise<FsBufferSnapshot> =>
    this.load(relativePath, true, (content) => {
      // Capture text and its CAS token before yielding to another edit or root transition.
      const status = this.options.buffers.getStatus(relativePath)
      if (!status) throw new Error('Workspace buffer disappeared; retry the operation')
      return { ...status, content, session_generation: this.options.getSessionGeneration?.() ?? 0 }
    })

  readonly readForAnalysis = (relativePath: string): Promise<string> =>
    this.load(relativePath, false, (content) => content)

  private readonly load = async <T>(
    relativePath: string,
    cacheCleanFile: boolean,
    select: (content: string) => T,
  ): Promise<T> => {
    const state = this.options.getState()
    this.options.assertCurrentRoot?.(state)
    const absolutePath = this.options.resolvePath(relativePath)
    const cached = this.options.buffers.readCached(relativePath)
    const revision = this.options.buffers.getStatus(relativePath)?.revision
    // Explicit opens must see persisted changes even before a watcher invalidates the cache.
    // Unsaved buffers remain authoritative, including edits made during the async read below.
    if (
      cached != null &&
      (!cacheCleanFile || this.options.buffers.getStatus(relativePath)?.dirty)
    ) {
      return select(cached)
    }
    const sidecarContent = await trySidecarReadFile({
      knowledgeEngineService: this.options.knowledgeEngineService,
      logger: this.options.logger,
      path: relativePath,
      state,
    })
    this.options.assertCurrentRoot?.(state)
    const content = sidecarContent ?? (await fs.promises.readFile(absolutePath, 'utf8'))
    this.options.assertCurrentRoot?.(state)
    if (cacheCleanFile) {
      // A newer edit can finish saving while this read is still in flight.
      if (this.options.buffers.getStatus(relativePath)?.revision !== revision) {
        const latest = this.options.buffers.readCached(relativePath)
        if (latest != null)
          return select(this.options.buffers.reconcilePersistedRead(relativePath, content))
      }
      return select(this.options.buffers.cacheCleanFile(relativePath, content))
    }
    return select(this.options.buffers.reconcilePersistedRead(relativePath, content))
  }
}
