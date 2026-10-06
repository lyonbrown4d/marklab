import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { NodeSearchIndex } from '@electron/services/knowledgeEngine/nodeSearchIndex'

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })),
  )
})

const createStorageRoot = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-search-sqlite-'))
  tempRoots.push(root)
  return root
}

describe('NodeSearchIndex SQLite FTS5 persistence', () => {
  it('persists the only search index in search.sqlite3 with WAL and FTS5', async () => {
    const storageRoot = await createStorageRoot()
    const index = new NodeSearchIndex(storageRoot, 'workspace-a')

    await index.rebuild([
      { path: 'notes/alpha.md', title: 'Alpha', content: 'durable local search' },
    ])
    await index.close()

    const entries = await fs.readdir(storageRoot)
    expect(entries).toContain('search.sqlite3')
    expect(entries.some((entry) => entry.endsWith('.json'))).toBe(false)

    const database = new Database(path.join(storageRoot, 'search.sqlite3'), { readonly: true })
    try {
      expect(database.pragma('journal_mode', { simple: true })).toBe('wal')
      expect(database.pragma('busy_timeout', { simple: true })).toBe(5_000)
      const table = database
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'search_fts'")
        .get() as { sql: string } | undefined
      expect(table?.sql.toLocaleLowerCase()).toContain('using fts5')
      const migration = database
        .prepare('SELECT name FROM kysely_migration ORDER BY name')
        .get() as { name: string } | undefined
      expect(migration?.name).toBe('001_create_search_index')
    } finally {
      database.close()
    }
  })
})
