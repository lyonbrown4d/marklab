import fs from 'node:fs/promises'
import path from 'node:path'

import Sqlite from 'better-sqlite3'
import { Kysely, SqliteDialect } from 'kysely'
import { Migrator, type MigrationProvider } from 'kysely/migration'

import { migrations } from '@electron/database/migrations/index'
import {
  DATABASE_DIRECTORY_NAME,
  DATABASE_FILE_NAME,
  DATABASE_BUSY_TIMEOUT_MS,
} from '@electron/database/schema'
import { configureSqlitePragmas } from '@electron/database/sqlitePragmas'
import type { DatabaseSchema } from '@electron/database/types'

export type LocalDatabaseServiceOptions = {
  userDataPath: string
  migrationProvider?: MigrationProvider
  chmod?: (target: string, mode: number) => Promise<void>
  platform?: NodeJS.Platform
}

export class LocalDatabaseService {
  readonly databasePath: string

  private connection: Kysely<DatabaseSchema> | null = null
  private initialization: Promise<void> | null = null
  private closing: Promise<void> | null = null
  private nativeDatabase: Sqlite.Database | null = null
  private readonly chmod: (target: string, mode: number) => Promise<void>
  private readonly migrationProvider: MigrationProvider
  private readonly platform: NodeJS.Platform

  constructor(options: LocalDatabaseServiceOptions) {
    if (!path.isAbsolute(options.userDataPath)) {
      throw new Error('Local database user data path must be absolute')
    }
    this.databasePath = path.join(
      path.resolve(options.userDataPath),
      DATABASE_DIRECTORY_NAME,
      DATABASE_FILE_NAME,
    )
    this.chmod = options.chmod ?? ((target, mode) => fs.chmod(target, mode))
    this.migrationProvider = options.migrationProvider ?? migrations
    this.platform = options.platform ?? process.platform
  }

  get database(): Kysely<DatabaseSchema> {
    if (!this.connection) throw new Error('Local database is not initialized')
    return this.connection
  }

  get sqlite(): Sqlite.Database {
    if (!this.nativeDatabase) throw new Error('Local database is not initialized')
    return this.nativeDatabase
  }

  get isOpen(): boolean {
    return this.nativeDatabase?.open ?? false
  }

  async initialize(): Promise<void> {
    if (this.initialization) return this.initialization
    if (this.connection) return
    const initialization = this.openAndMigrate()
    this.initialization = initialization
    try {
      await initialization
    } finally {
      if (this.initialization === initialization) this.initialization = null
    }
  }

  async close(): Promise<void> {
    if (this.initialization) {
      await this.initialization.catch(() => undefined)
    }
    if (this.closing) return this.closing
    const connection = this.connection
    const nativeDatabase = this.nativeDatabase
    if (!connection) return
    this.connection = null
    this.nativeDatabase = null
    const closing = this.destroyConnection(connection, nativeDatabase)
    this.closing = closing
    try {
      await closing
    } finally {
      if (this.closing === closing) this.closing = null
    }
  }

  private async openAndMigrate(): Promise<void> {
    await this.createStorageDirectory()
    const nativeDatabase = this.openNativeDatabase()
    let connection: Kysely<DatabaseSchema> | null = null
    try {
      await this.restrictPermissions(this.databasePath, 0o600)
      this.configureConnection(nativeDatabase)
      connection = new Kysely<DatabaseSchema>({
        dialect: new SqliteDialect({ database: nativeDatabase }),
      })
      const result = await new Migrator({
        db: connection,
        provider: this.migrationProvider,
      }).migrateToLatest()
      if (result.error) {
        const failed = result.results?.find(({ status }) => status === 'Error')?.migrationName
        const migration = failed ? ` "${failed}"` : ''
        throw new Error(
          `Local database migration${migration} failed: ${errorMessage(result.error)}`,
          { cause: result.error },
        )
      }
      this.nativeDatabase = nativeDatabase
      this.connection = connection
    } catch (error) {
      this.connection = null
      this.nativeDatabase = null
      if (connection) await this.destroyConnection(connection, nativeDatabase)
      else if (nativeDatabase.open) nativeDatabase.close()
      throw error
    }
  }

  private async createStorageDirectory(): Promise<void> {
    const directory = path.dirname(this.databasePath)
    try {
      await fs.mkdir(directory, { recursive: true })
    } catch (error) {
      throw new Error(`Local database directory could not be created at "${directory}"`, {
        cause: error,
      })
    }
    await this.restrictPermissions(directory, 0o700)
  }

  private openNativeDatabase(): Sqlite.Database {
    try {
      return new Sqlite(this.databasePath)
    } catch (error) {
      throw new Error(`Local database could not be opened at "${this.databasePath}"`, {
        cause: error,
      })
    }
  }

  private configureConnection(database: Sqlite.Database): void {
    configureSqlitePragmas(database, {
      busyTimeoutMs: DATABASE_BUSY_TIMEOUT_MS,
      foreignKeys: true,
      journalMode: 'wal',
    })
  }

  private async restrictPermissions(target: string, mode: number): Promise<void> {
    try {
      await this.chmod(target, mode)
    } catch (error) {
      if (this.platform === 'win32') return
      throw new Error(`Local database permissions could not be restricted for "${target}"`, {
        cause: error,
      })
    }
  }

  private async destroyConnection(
    connection: Kysely<DatabaseSchema>,
    nativeDatabase: Sqlite.Database | null,
  ): Promise<void> {
    try {
      await connection.destroy()
    } finally {
      if (nativeDatabase?.open) nativeDatabase.close()
    }
  }
}

const errorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message
  return String(error)
}
