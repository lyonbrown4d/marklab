import { statSync } from 'node:fs'

import { LocalAiStateRepository } from '@electron/database/repositories/localAiStateRepository'
import type { LocalDatabaseService } from '@electron/database/service'
import type {
  LocalAiDirectoryConfig,
  LocalAiDirectoryMigration,
} from '@electron/services/ai/local/types'

export type LocalAiDirectoryStoreOptions = {
  deviceIdForPath?: (directory: string) => string
}

export class LocalAiDirectoryStore {
  private lastJournalBytes = 0
  private lastJournalState: LocalAiDirectoryMigration['state'] | undefined
  private readonly deviceIdForPath: (directory: string) => string
  private readonly state: LocalAiStateRepository

  constructor(
    private readonly localDatabase: LocalDatabaseService,
    options: LocalAiDirectoryStoreOptions = {},
  ) {
    this.deviceIdForPath = options.deviceIdForPath ?? defaultDeviceIdForPath
    this.state = new LocalAiStateRepository(localDatabase.database, localDatabase.sqlite)
    this.recoverInterruptedMigration()
  }

  getConfig(): LocalAiDirectoryConfig {
    const state = this.state.find()
    if (!state) return { enabled: false }
    return {
      enabled: state.modelDirectoryEnabled,
      ...(state.modelDirectoryPath ? { path: state.modelDirectoryPath } : {}),
    }
  }

  getMigration(): LocalAiDirectoryMigration | undefined {
    return parseMigration(this.state.find()?.migrationJson)
  }

  getDeviceId(): string | undefined {
    return this.state.find()?.modelDirectoryDeviceId ?? undefined
  }

  commit(config: LocalAiDirectoryConfig): void {
    const deviceId = config.enabled && config.path ? this.deviceIdForPath(config.path) : undefined
    this.state.upsertDirectoryConfig({
      deviceId,
      enabled: config.enabled,
      path: config.path,
      updatedAt: new Date().toISOString(),
    })
  }

  recordMigration(migration: LocalAiDirectoryMigration): void {
    const stateChanged = migration.state !== this.lastJournalState
    const advancedEnough = migration.copiedBytes - this.lastJournalBytes >= 16 * 1024 * 1024
    if (!stateChanged && !advancedEnough) return
    this.writeMigration(migration)
    this.lastJournalBytes = migration.copiedBytes
    this.lastJournalState = migration.state
  }

  private recoverInterruptedMigration(): void {
    const recover = this.localDatabase.sqlite.transaction(() => {
      const migration = parseMigration(this.state.find()?.migrationJson)
      if (!migration || isTerminal(migration.state)) return
      this.writeMigration({
        ...migration,
        state: 'error',
        error: 'Model directory migration was interrupted and can be retried',
      })
    })
    recover()
  }

  private writeMigration(migration: LocalAiDirectoryMigration): void {
    this.state.upsertMigrationJson(JSON.stringify(migration), new Date().toISOString())
  }
}

const defaultDeviceIdForPath = (directory: string): string => statSync(directory).dev.toString()

const parseMigration = (
  value: string | null | undefined,
): LocalAiDirectoryMigration | undefined => {
  if (!value) return undefined
  try {
    const migration = JSON.parse(value) as unknown
    return isMigration(migration) ? migration : undefined
  } catch {
    return undefined
  }
}

const isMigration = (value: unknown): value is LocalAiDirectoryMigration =>
  Boolean(value) &&
  typeof value === 'object' &&
  typeof (value as LocalAiDirectoryMigration).migrationId === 'string' &&
  typeof (value as LocalAiDirectoryMigration).state === 'string'
const isTerminal = (state: LocalAiDirectoryMigration['state']): boolean =>
  state === 'completed' || state === 'error'
