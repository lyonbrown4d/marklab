import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { LocalAiDirectoryStore } from '@electron/services/ai/local/directoryStore.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
})

describe('LocalAiDirectoryStore', () => {
  it('persists authoritative directory config independently of renderer preferences', async () => {
    const root = await createRoot()
    const models = path.join(root, 'models')
    await fs.mkdir(models)
    const store = new LocalAiDirectoryStore(root)
    store.commit({ enabled: true, path: models })

    expect(new LocalAiDirectoryStore(root).getConfig()).toEqual({
      enabled: true,
      path: models,
    })
  })

  it('replays an interrupted journal as a retryable error while retaining old config', async () => {
    const root = await createRoot()
    const store = new LocalAiDirectoryStore(root)
    store.recordMigration({
      migrationId: 'migration-1',
      state: 'copying',
      from: 'C:/old',
      to: 'D:/new',
      copiedBytes: 10,
      totalBytes: 100,
      percent: 10,
    })

    const restarted = new LocalAiDirectoryStore(root)

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
