import fs from 'node:fs'

import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service'
import type { Logger } from '@electron/services/logger'
import type { FsStateData } from '@electron/services/workspace/types'
import type { WorkspaceBufferStore } from '@electron/services/workspace/workspaceBuffers'
import { trySidecarReadFile } from '@electron/services/workspace/workspaceSidecarFileBridge'

type WorkspaceFileReaderOptions = {
  buffers: Pick<
    WorkspaceBufferStore,
    'cacheCleanFile' | 'getStatus' | 'readCached' | 'reconcilePersistedRead'
  >
  getState: () => FsStateData
  knowledgeEngineService?: KnowledgeEngineService
  logger: Logger
  resolvePath: (relativePath: string) => string
}

export class WorkspaceFileReader {
  constructor(private readonly options: WorkspaceFileReaderOptions) {}

  readonly open = (relativePath: string): Promise<string> => this.load(relativePath, true)

  readonly readForAnalysis = (relativePath: string): Promise<string> =>
    this.load(relativePath, false)

  private readonly load = async (
    relativePath: string,
    cacheCleanFile: boolean,
  ): Promise<string> => {
    const absolutePath = this.options.resolvePath(relativePath)
    const cached = this.options.buffers.readCached(relativePath)
    const revision = this.options.buffers.getStatus(relativePath)?.revision
    // Explicit opens must see persisted changes even before a watcher invalidates the cache.
    // Unsaved buffers remain authoritative, including edits made during the async read below.
    if (
      cached != null &&
      (!cacheCleanFile || this.options.buffers.getStatus(relativePath)?.dirty)
    ) {
      return cached
    }
    const sidecarContent = await trySidecarReadFile({
      knowledgeEngineService: this.options.knowledgeEngineService,
      logger: this.options.logger,
      path: relativePath,
      state: this.options.getState(),
    })
    const content = sidecarContent ?? (await fs.promises.readFile(absolutePath, 'utf8'))
    if (cacheCleanFile) {
      // A newer edit can finish saving while this read is still in flight.
      if (this.options.buffers.getStatus(relativePath)?.revision !== revision) {
        const latest = this.options.buffers.readCached(relativePath)
        if (latest != null)
          return this.options.buffers.reconcilePersistedRead(relativePath, content)
      }
      return this.options.buffers.cacheCleanFile(relativePath, content)
    }
    return this.options.buffers.reconcilePersistedRead(relativePath, content)
  }
}
