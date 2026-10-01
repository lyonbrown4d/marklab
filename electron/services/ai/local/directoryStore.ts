import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import type {
  LocalAiDirectoryConfig,
  LocalAiDirectoryMigration,
} from '@electron/services/ai/local/types.js'

type DirectoryState = {
  version: 1
  config: LocalAiDirectoryConfig
  migration?: LocalAiDirectoryMigration
  deviceId?: string
}

export class LocalAiDirectoryStore {
  private state: DirectoryState
  private lastJournalBytes = 0
  private lastJournalState: LocalAiDirectoryMigration['state'] | undefined
  private readonly filePath: string

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, 'local-ai-directory.json')
    this.state = this.read()
    const migration = this.state.migration
    if (migration && !isTerminal(migration.state)) {
      this.state.migration = {
        ...migration,
        state: 'error',
        error: 'Model directory migration was interrupted and can be retried',
      }
      this.write()
    }
  }

  getConfig(): LocalAiDirectoryConfig {
    return { ...this.state.config }
  }

  getMigration(): LocalAiDirectoryMigration | undefined {
    return this.state.migration ? { ...this.state.migration } : undefined
  }

  getDeviceId(): string | undefined {
    return this.state.deviceId
  }

  commit(config: LocalAiDirectoryConfig): void {
    const deviceId =
      config.enabled && config.path ? fs.statSync(config.path).dev.toString() : undefined
    this.state = {
      ...this.state,
      config: { ...config },
      ...(deviceId ? { deviceId } : { deviceId: undefined }),
    }
    this.write()
  }

  recordMigration(migration: LocalAiDirectoryMigration): void {
    const stateChanged = migration.state !== this.lastJournalState
    const advancedEnough = migration.copiedBytes - this.lastJournalBytes >= 16 * 1024 * 1024
    if (!stateChanged && !advancedEnough) return
    this.state = { ...this.state, migration: { ...migration } }
    this.lastJournalBytes = migration.copiedBytes
    this.lastJournalState = migration.state
    this.write()
  }

  private read(): DirectoryState {
    try {
      const value = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Partial<DirectoryState>
      if (value.version !== 1 || !isConfig(value.config)) return defaultState()
      return {
        version: 1,
        config: value.config,
        ...(typeof value.deviceId === 'string' ? { deviceId: value.deviceId } : {}),
        ...(isMigration(value.migration) ? { migration: value.migration } : {}),
      }
    } catch {
      return defaultState()
    }
  }

  private write(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`
    const file = fs.openSync(temporaryPath, 'wx', 0o600)
    try {
      fs.writeFileSync(file, JSON.stringify(this.state))
      fs.fsyncSync(file)
    } finally {
      fs.closeSync(file)
    }
    fs.renameSync(temporaryPath, this.filePath)
    try {
      const directory = fs.openSync(path.dirname(this.filePath), 'r')
      try {
        fs.fsyncSync(directory)
      } finally {
        fs.closeSync(directory)
      }
    } catch (error) {
      if (process.platform !== 'win32') throw error
    }
  }
}

const defaultState = (): DirectoryState => ({ version: 1, config: { enabled: false } })
const isConfig = (value: unknown): value is LocalAiDirectoryConfig =>
  Boolean(value) &&
  typeof value === 'object' &&
  typeof (value as LocalAiDirectoryConfig).enabled === 'boolean' &&
  ((value as LocalAiDirectoryConfig).path === undefined ||
    typeof (value as LocalAiDirectoryConfig).path === 'string')
const isMigration = (value: unknown): value is LocalAiDirectoryMigration =>
  Boolean(value) &&
  typeof value === 'object' &&
  typeof (value as LocalAiDirectoryMigration).migrationId === 'string' &&
  typeof (value as LocalAiDirectoryMigration).state === 'string'
const isTerminal = (state: LocalAiDirectoryMigration['state']): boolean =>
  state === 'completed' || state === 'error'
