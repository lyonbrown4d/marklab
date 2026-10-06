import fs from 'node:fs/promises'

import { downloadModel } from '@electron/services/ai/local/modelDownload'
import { normalizeError } from '@electron/services/ai/local/modelFiles'
import type { LocalAiCatalogEntry, LocalAiProgressHandler } from '@electron/services/ai/local/types'

type FileSystemStats = { bavail: bigint | number; bsize: bigint | number }
type ActiveDownload = { controller: AbortController; done: Promise<void>; modelId: string }

type ModelDownloadTasksOptions = {
  ensureDirectory: () => Promise<void>
  fetch: typeof fetch
  finalPath: (entry: LocalAiCatalogEntry) => string
  minimumFreeBytes: number
  modelDirectory: () => string
  partPath: (entry: LocalAiCatalogEntry) => string
  statfs: (filePath: string) => Promise<FileSystemStats>
  taskIdFactory: () => string
}

export class ModelDownloadTasks {
  private readonly downloads = new Map<string, ActiveDownload>()

  constructor(private readonly options: ModelDownloadTasksOptions) {}

  async start(
    entry: LocalAiCatalogEntry,
    onProgress: LocalAiProgressHandler,
  ): Promise<{ taskId: string }> {
    if ([...this.downloads.values()].some((task) => task.modelId === entry.id)) {
      throw new Error('This model is already downloading')
    }
    const taskId = this.options.taskIdFactory()
    const controller = new AbortController()
    const prepared = Promise.resolve().then(async () => {
      await this.options.ensureDirectory()
      controller.signal.throwIfAborted()
      await this.assertFreeSpace(entry)
      controller.signal.throwIfAborted()
      onProgress(progress(taskId, entry, 'queued', 0))
    })
    const activeDownload: ActiveDownload = {
      controller,
      done: Promise.resolve(),
      modelId: entry.id,
    }
    const done = prepared
      .then(() => this.run(taskId, entry, controller, onProgress))
      .finally(() => {
        if (this.downloads.get(taskId) === activeDownload) this.downloads.delete(taskId)
      })
    activeDownload.done = done
    this.downloads.set(taskId, activeDownload)
    void done.catch(() => undefined)
    await prepared
    return { taskId }
  }

  cancel(taskId: string): void {
    this.downloads.get(taskId)?.controller.abort()
  }

  async cancelModel(modelId: string): Promise<void> {
    const tasks = [...this.downloads.values()].filter((task) => task.modelId === modelId)
    tasks.forEach((task) => task.controller.abort())
    await Promise.allSettled(tasks.map((task) => task.done))
  }

  hasActive(): boolean {
    return this.downloads.size > 0
  }

  private async run(
    taskId: string,
    entry: LocalAiCatalogEntry,
    controller: AbortController,
    onProgress: LocalAiProgressHandler,
  ): Promise<void> {
    try {
      await downloadModel({
        entry,
        fetch: this.options.fetch,
        finalPath: this.options.finalPath(entry),
        onProgress,
        partPath: this.options.partPath(entry),
        signal: controller.signal,
        taskId,
      })
      onProgress(progress(taskId, entry, 'completed', entry.sizeBytes))
    } catch (error) {
      const cancelled = controller.signal.aborted
      onProgress({
        ...progress(taskId, entry, cancelled ? 'cancelled' : 'error', 0),
        ...(cancelled ? {} : { error: normalizeError(error, 'Model download failed') }),
      })
    }
  }

  private async assertFreeSpace(entry: LocalAiCatalogEntry): Promise<void> {
    const stats = await this.options.statfs(this.options.modelDirectory())
    const availableBytes = Number(stats.bavail) * Number(stats.bsize)
    const required = entry.sizeBytes - (await this.partBytes(entry)) + this.options.minimumFreeBytes
    if (availableBytes < required) throw new Error('Not enough free disk space for this model')
  }

  private async partBytes(entry: LocalAiCatalogEntry): Promise<number> {
    try {
      return Math.min((await fs.stat(this.options.partPath(entry))).size, entry.sizeBytes)
    } catch {
      return 0
    }
  }
}

const progress = (
  taskId: string,
  entry: LocalAiCatalogEntry,
  state: 'queued' | 'completed' | 'cancelled' | 'error',
  downloadedBytes: number,
) => ({
  taskId,
  modelId: entry.id,
  state,
  downloadedBytes,
  totalBytes: entry.sizeBytes,
  percent: entry.sizeBytes === 0 ? 100 : (downloadedBytes / entry.sizeBytes) * 100,
})
