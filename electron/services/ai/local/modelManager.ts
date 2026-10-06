import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { ModelDownloadTasks } from '@electron/services/ai/local/modelDownloadTasks'
import { fileExistsWithSize, normalizeError } from '@electron/services/ai/local/modelFiles'
import { runModelDirectoryMigration } from '@electron/services/ai/local/modelDirectoryMigration'
import {
  normalizeCustomModelDirectory,
  validateExistingModelDirectory,
} from '@electron/services/ai/local/modelDirectoryPaths'
import { writeActiveModelId } from '@electron/services/ai/local/modelMigration'
import {
  isSameOrChildPath,
  mapLocalAiModels,
  resolveInitialModelDirectory,
  validateModelCatalog,
} from '@electron/services/ai/local/modelManagerSupport'
import type {
  LocalAiCatalogEntry,
  LocalAiDirectoryConfig,
  LocalAiDirectoryMigration,
  LocalAiDirectoryMigrationHooks,
  LocalAiModelManagerContract,
  LocalAiModelManagerStatus,
  LocalAiProgressHandler,
} from '@electron/services/ai/local/types'
type FileSystemStats = { bavail: bigint | number; bsize: bigint | number }
type LocalAiModelManagerOptions = {
  userDataPath: string
  catalog: readonly LocalAiCatalogEntry[]
  fetch?: typeof fetch
  statfs?: (filePath: string) => Promise<FileSystemStats>
  taskIdFactory?: () => string
  minimumFreeBytes?: number
  forbiddenModelDirectories?: string[]
  initialDirectoryPreference?: LocalAiDirectoryConfig
  initialMigration?: LocalAiDirectoryMigration
  initialDeviceId?: string
  removeFile?: (filePath: string) => Promise<void>
}
const DEFAULT_MINIMUM_FREE_BYTES = 64 * 1024 * 1024
export class LocalAiModelManager implements LocalAiModelManagerContract {
  private readonly catalog: Map<string, LocalAiCatalogEntry>
  private readonly downloads: ModelDownloadTasks
  private readonly defaultModelDirectory: string
  private modelDirectory: string
  private customModelDirectoryEnabled = false
  private migration: LocalAiDirectoryMigration | undefined
  private migrationTask: Promise<void> | null = null
  private readonly forbiddenModelDirectories: string[]
  private readonly removeFile: (filePath: string) => Promise<void>
  private expectedDeviceId: string | undefined

  constructor(options: LocalAiModelManagerOptions) {
    validateModelCatalog(options.catalog)
    this.catalog = new Map(options.catalog.map((entry) => [entry.id, entry]))
    this.defaultModelDirectory = path.join(path.resolve(options.userDataPath), 'models')
    this.forbiddenModelDirectories = (options.forbiddenModelDirectories ?? []).map((directory) =>
      path.normalize(path.resolve(directory)),
    )
    const initialDirectory = resolveInitialModelDirectory(
      options.initialDirectoryPreference,
      this.defaultModelDirectory,
    )
    this.modelDirectory = initialDirectory.path
    this.customModelDirectoryEnabled = initialDirectory.enabled
    this.migration = options.initialMigration
    this.expectedDeviceId = options.initialDeviceId
    this.removeFile = options.removeFile ?? ((filePath) => fs.rm(filePath, { force: true }))
    this.downloads = new ModelDownloadTasks({
      ensureDirectory: () => this.ensureDirectory(),
      fetch: options.fetch ?? fetch,
      finalPath: (entry) => this.pathFor(entry),
      minimumFreeBytes: options.minimumFreeBytes ?? DEFAULT_MINIMUM_FREE_BYTES,
      modelDirectory: () => this.modelDirectory,
      partPath: (entry) => this.partPathFor(entry),
      statfs: options.statfs ?? ((filePath) => fs.statfs(filePath, { bigint: true })),
      taskIdFactory: options.taskIdFactory ?? randomUUID,
    })
  }
  async status(): Promise<LocalAiModelManagerStatus> {
    let directoryError: string | undefined
    try {
      await this.ensureDirectory()
    } catch (error) {
      directoryError = normalizeError(error, 'Model directory is unavailable')
    }
    const configuredActiveId = directoryError ? null : await this.readActiveModelId()
    const installed = new Map<string, boolean>()
    for (const entry of this.catalog.values()) {
      installed.set(
        entry.id,
        directoryError ? false : await fileExistsWithSize(this.pathFor(entry), entry.sizeBytes),
      )
    }
    const activeModelId =
      configuredActiveId && installed.get(configuredActiveId) ? configuredActiveId : null
    return {
      activeModelId,
      customModelDirectoryEnabled: this.customModelDirectoryEnabled,
      defaultModelDirectory: this.defaultModelDirectory,
      modelDirectory: this.modelDirectory,
      ...(this.migration ? { migration: this.migration } : {}),
      ...(directoryError ? { error: directoryError } : {}),
      models: mapLocalAiModels(this.catalog.values(), installed, activeModelId),
    }
  }

  async download(modelId: string, onProgress: LocalAiProgressHandler): Promise<{ taskId: string }> {
    const entry = this.requireEntry(modelId)
    this.assertMutable()
    return this.downloads.start(entry, onProgress)
  }

  async cancelDownload(taskId: string): Promise<{ ok: true }> {
    this.downloads.cancel(taskId)
    return { ok: true }
  }

  async deleteModel(modelId: string): Promise<{ ok: true }> {
    this.assertMutable()
    await this.ensureDirectory()
    const entry = this.requireEntry(modelId)
    await this.downloads.cancelModel(modelId)
    await fs.rm(this.pathFor(entry), { force: true })
    await fs.rm(this.partPathFor(entry), { force: true })
    if ((await this.readActiveModelId()) === modelId) await this.writeActiveModelId(null)
    return { ok: true }
  }

  async setActiveModel(modelId: string): Promise<{ ok: true }> {
    this.assertMutable()
    await this.ensureDirectory()
    const entry = this.requireEntry(modelId)
    if (!(await fileExistsWithSize(this.pathFor(entry), entry.sizeBytes))) {
      throw new Error('Local AI model is not installed')
    }
    await this.writeActiveModelId(modelId)
    return { ok: true }
  }

  hasActiveDownloads(): boolean {
    return this.downloads.hasActive()
  }

  isMigrationActive(): boolean {
    return this.migrationTask !== null
  }

  startModelDirectoryMigration(
    config: LocalAiDirectoryConfig,
    hooks: LocalAiDirectoryMigrationHooks,
  ): Promise<void> {
    if (this.isMigrationActive() || this.hasActiveDownloads()) {
      throw new Error('Local AI model directory is busy')
    }
    const target = config.enabled
      ? normalizeCustomModelDirectory(config.path)
      : this.defaultModelDirectory
    if (this.forbiddenModelDirectories.some((directory) => isSameOrChildPath(target, directory))) {
      throw new Error('Custom model directory must not be inside the application directory')
    }
    const from = this.modelDirectory
    const initial: LocalAiDirectoryMigration = {
      migrationId: randomUUID(),
      state: 'copying',
      from,
      to: target,
      copiedBytes: 0,
      totalBytes: 0,
      percent: 0,
    }
    this.setMigration(initial, hooks)
    const task = this.runDirectoryMigration(config, from, target, initial, hooks)
    this.migrationTask = task
    void task.finally(() => {
      if (this.migrationTask === task) this.migrationTask = null
    })
    return task
  }

  async modelPath(modelId: string): Promise<string> {
    await this.ensureDirectory()
    const entry = this.requireEntry(modelId)
    const modelPath = this.pathFor(entry)
    if (!(await fileExistsWithSize(modelPath, entry.sizeBytes))) {
      throw new Error('Local AI model is not installed')
    }
    return modelPath
  }

  private async readActiveModelId(directory = this.modelDirectory): Promise<string | null> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.statePath(directory), 'utf8')) as unknown
      if (!parsed || typeof parsed !== 'object') return null
      const activeModelId = (parsed as { activeModelId?: unknown }).activeModelId
      return typeof activeModelId === 'string' && this.catalog.has(activeModelId)
        ? activeModelId
        : null
    } catch {
      return null
    }
  }

  private async writeActiveModelId(activeModelId: string | null): Promise<void> {
    await this.ensureDirectory()
    await writeActiveModelId(this.modelDirectory, activeModelId)
  }

  private requireEntry(modelId: string): LocalAiCatalogEntry {
    const entry = this.catalog.get(modelId)
    if (!entry) throw new Error('Local AI model was not found')
    return entry
  }

  private pathFor(entry: LocalAiCatalogEntry): string {
    return path.join(this.modelDirectory, entry.fileName)
  }

  private partPathFor(entry: LocalAiCatalogEntry): string {
    return `${this.pathFor(entry)}.part`
  }

  private statePath(directory = this.modelDirectory): string {
    return path.join(directory, '.marklab-local-ai.json')
  }

  private async ensureDirectory(): Promise<void> {
    if (!this.customModelDirectoryEnabled) {
      await fs.mkdir(this.modelDirectory, { recursive: true })
      return
    }
    const validated = await validateExistingModelDirectory(
      this.modelDirectory,
      this.forbiddenModelDirectories,
    )
    if (this.expectedDeviceId && validated.deviceId !== this.expectedDeviceId) {
      throw new Error('Custom model directory volume identity changed')
    }
  }

  private assertMutable(): void {
    if (this.isMigrationActive()) {
      throw new Error('Local AI model directory is busy')
    }
  }

  private async runDirectoryMigration(
    config: LocalAiDirectoryConfig,
    from: string,
    to: string,
    initial: LocalAiDirectoryMigration,
    hooks: LocalAiDirectoryMigrationHooks,
  ): Promise<void> {
    try {
      const result = await runModelDirectoryMigration({
        catalog: [...this.catalog.values()],
        config,
        customDirectoryEnabled: this.customModelDirectoryEnabled,
        forbiddenDirectories: this.forbiddenModelDirectories,
        from,
        hooks: {
          ...hooks,
          onProgress: (migration) => this.setMigration(migration, hooks),
        },
        initial,
        readActiveModelId: (directory) => this.readActiveModelId(directory),
        removeFile: this.removeFile,
        to,
      })
      this.modelDirectory = result.directory
      this.customModelDirectoryEnabled = config.enabled
      this.expectedDeviceId = result.deviceId
      this.setMigration(
        {
          ...this.migration!,
          state: 'completed',
          ...(result.warning ? { warning: result.warning } : {}),
        },
        hooks,
      )
    } catch (error) {
      this.setMigration(
        {
          ...this.migration!,
          state: 'error',
          error: normalizeError(error, 'Model directory migration failed'),
        },
        hooks,
      )
    }
  }

  private setMigration(
    migration: LocalAiDirectoryMigration,
    hooks: LocalAiDirectoryMigrationHooks,
  ): void {
    this.migration = migration
    hooks.onProgress(migration)
  }
}
