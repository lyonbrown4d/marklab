import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import Database from 'better-sqlite3'
import { sql, type Kysely } from 'kysely'
import type { MigrationProvider } from 'kysely/migration'
import { afterEach, describe, expect, it } from 'vitest'

import { migrations } from '@electron/database/migrations/index'
import { LocalDatabaseService } from '@electron/database/localDatabaseService'
import type { DatabaseSchema } from '@electron/database/types'

const expectedTables = [
  'ai_providers',
  'graph_layouts',
  'graph_node_layouts',
  'workspace_graphs',
  'recent_workspaces',
  'session_tabs',
  'settings',
  'sync_conflicts',
  'webdav_profiles',
  'webdav_sync_entries',
  'webdav_sync_state',
  'window_sessions',
  'window_state',
  'workspace_sync_channels',
  'workspaces',
] as const

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
})

describe('LocalDatabaseService', () => {
  it('creates the migrated database at the application storage path', async () => {
    const { root, service } = await createService()

    expect(service.databasePath).toBe(path.join(root, 'storage', 'marklab.sqlite3'))
    expect(service.isOpen).toBe(true)
    await expect(fs.stat(service.databasePath)).resolves.toMatchObject({
      isFile: expect.any(Function),
    })

    const tables = await sql<{ name: string }>`
      select name from sqlite_master where type = 'table' order by name
    `.execute(service.database)
    const names = tables.rows.map(({ name }) => name)
    expect(names).toEqual(expect.arrayContaining([...expectedTables]))
    expect(names).toContain('kysely_migration')
    expect(names).toContain('kysely_migration_lock')
    expect(names).not.toContain('local_ai_state')

    await service.close()
  })

  it('uses an explicit static migration provider', async () => {
    const available = await migrations.getMigrations()

    expect(Object.keys(available)).toEqual(['001_initial'])
  })

  it('enables WAL, foreign keys, and a bounded busy timeout', async () => {
    const { service } = await createService()

    await expect(pragmaValue(service.database, 'journal_mode')).resolves.toBe('wal')
    await expect(pragmaValue(service.database, 'foreign_keys')).resolves.toBe(1)
    await expect(pragmaValue(service.database, 'busy_timeout')).resolves.toBe(5_000)

    await service.close()
  })

  it('enforces relational constraints and cascades workspace sync state', async () => {
    const { service } = await createService()
    const database = service.database
    const inserted = await database
      .insertInto('workspaces')
      .values({ canonical_path: 'C:/notes', path: 'C:/Notes', root_kind: 'external' })
      .returning('id')
      .executeTakeFirstOrThrow()

    await database
      .insertInto('webdav_sync_state')
      .values({ workspace_id: inserted.id, updated_at: '2026-10-06T00:00:00.000Z' })
      .execute()
    await database
      .insertInto('webdav_sync_entries')
      .values({
        device_id: 'device-a',
        hash: 'a'.repeat(64),
        modified_at: '2026-10-06T00:00:00.000Z',
        path: 'docs/readme.md',
        position: 0,
        size: 12,
        workspace_id: inserted.id,
      })
      .execute()

    await database.deleteFrom('workspaces').where('id', '=', inserted.id).execute()
    const remaining = await database
      .selectFrom('webdav_sync_entries')
      .select(({ fn }) => fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow()
    expect(remaining.count).toBe(0)

    await expect(
      database
        .insertInto('session_tabs')
        .values({ position: 0, session_id: 'missing', tab_id: 'tab-1', tab_type: 'file' })
        .execute(),
    ).rejects.toThrow()

    await service.close()
  })

  it('stores SQL metacharacters as data through Kysely parameters', async () => {
    const { service } = await createService()
    const value = `{"text":"'); drop table settings; --"}`

    await service.database
      .insertInto('settings')
      .values({ key: 'security.probe', value_json: value })
      .execute()

    const stored = await service.database
      .selectFrom('settings')
      .select('value_json')
      .where('key', '=', 'security.probe')
      .executeTakeFirstOrThrow()
    expect(stored.value_json).toBe(value)

    await service.close()
  })

  it('closes the connection and reports the failed migration', async () => {
    const root = await createRoot()
    let migrationDatabase: Kysely<unknown> | null = null
    const migrationProvider: MigrationProvider = {
      async getMigrations() {
        return {
          '999_fail': {
            async up(database) {
              migrationDatabase = database
              throw new Error('intentional migration failure')
            },
          },
        }
      },
    }
    const service = new LocalDatabaseService({
      migrationProvider,
      userDataPath: root,
    })

    await expect(service.initialize()).rejects.toThrow(/999_fail.*intentional migration failure/i)
    expect(service.isOpen).toBe(false)
    expect(() => service.database).toThrow(/not initialized/i)
    expect(migrationDatabase).not.toBeNull()
    await expect(sql`select 1`.execute(migrationDatabase!)).rejects.toThrow(/destroyed|not open/i)

    const probe = new Database(service.databasePath)
    expect(probe.open).toBe(true)
    probe.close()
  })

  it('can be initialized repeatedly and closed repeatedly', async () => {
    const root = await createRoot()
    const service = new LocalDatabaseService({ userDataPath: root })

    await Promise.all([service.initialize(), service.initialize()])
    const database = service.database
    await service.initialize()
    expect(service.database).toBe(database)

    await service.close()
    await expect(service.close()).resolves.toBeUndefined()
    expect(service.isOpen).toBe(false)
  })

  it('rejects native connection access before initialization', async () => {
    const root = await createRoot()
    const service = new LocalDatabaseService({ userDataPath: root })

    expect(() => service.sqlite).toThrow(/not initialized/i)
  })

  it('exposes a main-process native connection that supports bound parameters', async () => {
    const { service } = await createService()
    const value = `native '); drop table settings; --`

    const row = service.sqlite.prepare<[string], { value: string }>('select ? as value').get(value)

    expect(row?.value).toBe(value)
    await service.close()
  })

  it('does not expose the connection until an in-flight migration finishes', async () => {
    const root = await createRoot()
    let releaseMigration: () => void = () => undefined
    let markMigrationStarted: () => void = () => undefined
    const migrationStarted = new Promise<void>((resolve) => {
      markMigrationStarted = resolve
    })
    const migrationGate = new Promise<void>((resolve) => {
      releaseMigration = resolve
    })
    const migrationProvider: MigrationProvider = {
      async getMigrations() {
        return {
          '001_slow': {
            async up() {
              markMigrationStarted()
              await migrationGate
            },
          },
        }
      },
    }
    const service = new LocalDatabaseService({ migrationProvider, userDataPath: root })
    const firstInitialization = service.initialize()
    await migrationStarted

    const secondInitialization = service.initialize()
    let secondFinished = false
    void secondInitialization.then(() => {
      secondFinished = true
    })
    await Promise.resolve()

    expect(secondFinished).toBe(false)
    expect(service.isOpen).toBe(false)
    expect(() => service.database).toThrow(/not initialized/i)

    releaseMigration()
    await Promise.all([firstInitialization, secondInitialization])
    expect(service.isOpen).toBe(true)
    await service.close()
  })

  it('rejects relative user data paths', () => {
    expect(() => new LocalDatabaseService({ userDataPath: 'relative/path' })).toThrow(/absolute/i)
  })
})

const createRoot = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-database-'))
  roots.push(root)
  return root
}

const createService = async (): Promise<{ root: string; service: LocalDatabaseService }> => {
  const root = await createRoot()
  const service = new LocalDatabaseService({ userDataPath: root })
  await service.initialize()
  return { root, service }
}

const pragmaValue = async (
  database: Kysely<DatabaseSchema>,
  name: 'busy_timeout' | 'foreign_keys' | 'journal_mode',
): Promise<number | string> => {
  const result = await sql.raw<Record<string, number | string>>(`pragma ${name}`).execute(database)
  const row = result.rows[0]
  if (!row) throw new Error(`Missing PRAGMA result for ${name}`)
  return Object.values(row)[0]!
}
