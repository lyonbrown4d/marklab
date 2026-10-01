import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { FileLocalSyncStateStore } from '@electron/services/sync/webdavSync/stateStore.js'
import { canonicalWorkspaceStateKey } from '@electron/services/sync/webdavSync/stateStore.js'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
})

describe('FileLocalSyncStateStore', () => {
  it('atomically persists and reloads a validated workspace baseline', async () => {
    const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-sync-state-'))
    roots.push(userData)
    const store = new FileLocalSyncStateStore(userData)
    const state = {
      version: 1 as const,
      updatedAt: '2026-01-01T00:00:00.000Z',
      remoteManifestEtag: 'etag-1',
      baseline: [],
    }

    await store.save('/workspace/a', state)

    await expect(store.load('/workspace/a')).resolves.toEqual(state)
    const files = await fs.readdir(path.join(userData, 'sync', 'webdav'))
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/^[a-f0-9]{64}\.json$/)
  })

  it('uses NFC and platform case folding for workspace state identity', () => {
    expect(canonicalWorkspaceStateKey('/workspace/caf\u00e9', 'linux')).toBe(
      canonicalWorkspaceStateKey('/workspace/cafe\u0301', 'linux'),
    )
    expect(canonicalWorkspaceStateKey('C:\\Workspace\\Notes', 'win32')).toBe(
      canonicalWorkspaceStateKey('c:\\workspace\\notes', 'win32'),
    )
    expect(canonicalWorkspaceStateKey('/Users/Me/Notes', 'darwin')).toBe(
      canonicalWorkspaceStateKey('/users/me/notes', 'darwin'),
    )
  })

  it('roundtrips strictly validated unresolved conflicts', async () => {
    const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-sync-conflicts-'))
    roots.push(userData)
    const store = new FileLocalSyncStateStore(userData)
    const state = {
      version: 1 as const,
      updatedAt: '2026-01-01T00:00:00.000Z',
      baseline: [],
      unresolvedConflicts: [
        {
          path: 'notes/cafe\u0301.md',
          status: 'unresolved' as const,
          reason: 'both_changed' as const,
          conflictPath: 'notes/cafe\u0301.conflict.md',
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
          path: 'notes/caf\u00e9.md',
          conflictPath: 'notes/caf\u00e9.conflict.md',
        },
      ],
    })
  })

  it('roundtrips object-backed baseline entries and rejects unknown storage modes', async () => {
    const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-sync-object-state-'))
    roots.push(userData)
    const store = new FileLocalSyncStateStore(userData)
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
    const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-sync-bad-conflict-'))
    roots.push(userData)
    const store = new FileLocalSyncStateStore(userData)
    const state = {
      version: 1 as const,
      updatedAt: '2026-01-01T00:00:00.000Z',
      baseline: [],
    }
    await store.save('/workspace/corrupt', state)
    const directory = path.join(userData, 'sync', 'webdav')
    const [fileName] = await fs.readdir(directory)
    await fs.writeFile(
      path.join(directory, fileName!),
      JSON.stringify({
        ...state,
        unresolvedConflicts: [
          {
            path: '../outside.md',
            status: 'resolved',
            reason: 'invented',
            extra: true,
          },
        ],
      }),
    )

    await expect(store.load('/workspace/corrupt')).rejects.toThrow(/invalid/i)
  })
})
