import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { LocalDatabaseService } from '@electron/database/localDatabaseService'
import {
  canonicalWorkspaceStateKey,
  FileLocalSyncStateStore,
} from '@electron/services/sync/webdavSync/stateStore'

const roots: string[] = []
const databases: LocalDatabaseService[] = []

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()))
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
})

describe('FileLocalSyncStateStore', () => {
  it('atomically replaces and reloads a validated workspace baseline', async () => {
    const { database, store } = await createFixture()
    const state = {
      version: 1 as const,
      updatedAt: '2026-01-01T00:00:00.000Z',
      remoteManifestEtag: 'etag-1',
      baseline: [
        {
          path: 'notes/a.md',
          hash: 'a'.repeat(64),
          size: 1,
          modifiedAt: '2026-01-01T00:00:00.000Z',
          deviceId: 'device-a',
        },
      ],
    }

    await store.save('/workspace/a', state)
    await store.save('/workspace/a', { ...state, baseline: [] })

    await expect(store.load('/workspace/a')).resolves.toEqual({ ...state, baseline: [] })
    const entries = await database.database
      .selectFrom('webdav_sync_entries')
      .select(({ fn }) => fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow()
    expect(entries.count).toBe(0)
  })

  it('uses NFC and platform case folding for workspace state identity', () => {
    expect(canonicalWorkspaceStateKey('/workspace/café', 'linux')).toBe(
      canonicalWorkspaceStateKey('/workspace/café', 'linux'),
    )
    expect(canonicalWorkspaceStateKey('C:\\Workspace\\Notes', 'win32')).toBe(
      canonicalWorkspaceStateKey('c:\\workspace\\notes', 'win32'),
    )
    expect(canonicalWorkspaceStateKey('/Users/Me/Notes', 'darwin')).toBe(
      canonicalWorkspaceStateKey('/users/me/notes', 'darwin'),
    )
  })

  it('roundtrips strictly validated unresolved conflicts', async () => {
    const { store } = await createFixture()
    const state = {
      version: 1 as const,
      updatedAt: '2026-01-01T00:00:00.000Z',
      baseline: [],
      unresolvedConflicts: [
        {
          path: 'notes/café.md',
          status: 'unresolved' as const,
          reason: 'both_changed' as const,
          conflictPath: 'notes/café.conflict.md',
          localHash: 'a'.repeat(64),
          remoteHash: 'b'.repeat(64),
        },
      ],
    }

    await store.save('/workspace/conflicts', state)

    await expect(store.load('/workspace/conflicts')).resolves.toEqual({
      ...state,
      unresolvedConflicts: [
        {
          ...state.unresolvedConflicts[0],
          path: 'notes/café.md',
          conflictPath: 'notes/café.conflict.md',
        },
      ],
    })
  })

  it('roundtrips object-backed baseline entries and rejects unknown storage modes', async () => {
    const { store } = await createFixture()
    const entry = {
      path: 'notes/a.md',
      hash: 'a'.repeat(64),
      size: 1,
      modifiedAt: '2026-01-01T00:00:00.000Z',
      deviceId: 'device-a',
      storage: 'object' as const,
    }
    const state = {
      version: 1 as const,
      updatedAt: '2026-01-01T00:00:00.000Z',
      baseline: [entry],
    }

    await store.save('/workspace/object-state', state)
    await expect(store.load('/workspace/object-state')).resolves.toEqual(state)

    await expect(
      store.save('/workspace/invalid-storage', {
        ...state,
        baseline: [{ ...entry, storage: 'mutable-path' as never }],
      }),
    ).rejects.toThrow(/manifest/i)
  })

  it('fails closed for corrupt persisted conflict records', async () => {
    const { database, store } = await createFixture()
    const state = {
      version: 1 as const,
      updatedAt: '2026-01-01T00:00:00.000Z',
      baseline: [],
      unresolvedConflicts: [
        {
          path: 'notes/a.md',
          status: 'unresolved' as const,
          reason: 'both_changed' as const,
        },
      ],
    }
    await store.save('/workspace/corrupt', state)
    await database.database.updateTable('sync_conflicts').set({ path: '../outside.md' }).execute()

    await expect(store.load('/workspace/corrupt')).rejects.toThrow(/invalid/i)
  })
})

const createFixture = async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-sync-state-'))
  roots.push(root)
  const database = new LocalDatabaseService({ userDataPath: root })
  await database.initialize()
  databases.push(database)
  return { database, store: new FileLocalSyncStateStore(database) }
}
