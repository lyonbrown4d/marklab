import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { LocalDatabaseService } from '@electron/database/service'
import { LocalAiDirectoryStore } from '@electron/services/ai/local/directoryStore'

const roots: string[] = []
const databases: LocalDatabaseService[] = []

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()))
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
})

describe('LocalAiDirectoryStore', () => {
  it('persists authoritative directory config independently of renderer preferences', async () => {
    const root = await createRoot()
    const database = await createDatabase(root)
    const models = path.join(root, 'models')
    await fs.mkdir(models)
    const store = new LocalAiDirectoryStore(database)
    store.commit({ enabled: true, path: models })

    expect(new LocalAiDirectoryStore(database).getConfig()).toEqual({
      enabled: true,
      path: models,
    })
    await expect(fs.stat(path.join(root, 'local-ai-directory.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('replays an interrupted journal as a retryable error while retaining old config', async () => {
    const root = await createRoot()
    const database = await createDatabase(root)
    const store = new LocalAiDirectoryStore(database)
    store.recordMigration({
      migrationId: 'migration-1',
      state: 'copying',
      from: 'C:/old',
      to: 'D:/new',
      copiedBytes: 10,
      totalBytes: 100,
      percent: 10,
    })

    const restarted = new LocalAiDirectoryStore(database)

    expect(restarted.getConfig()).toEqual({ enabled: false })
    expect(restarted.getMigration()).toMatchObject({
      migrationId: 'migration-1',
      state: 'error',
      error: expect.stringMatching(/interrupted/i),
    })
  })
})

const createRoot = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-directory-store-'))
  roots.push(root)
  return root
}

const createDatabase = async (root: string): Promise<LocalDatabaseService> => {
  const database = new LocalDatabaseService({ userDataPath: root })
  await database.initialize()
  databases.push(database)
  return database
}
