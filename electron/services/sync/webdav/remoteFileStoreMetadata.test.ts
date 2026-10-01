import { describe, expect, it, vi } from 'vitest'

import { WebDavError } from '@electron/services/sync/webdav/errors.js'
import { createWebDavRemoteFileStore } from '@electron/services/sync/webdav/remoteFileStore.js'
import type { WebDavRemoteClient } from '@electron/services/sync/webdav/types.js'

describe('WebDAV sync metadata detection', () => {
  it('detects an empty internal metadata directory', async () => {
    const client = createClient()
    client.stat.mockResolvedValue({
      path: '.marklab-sync',
      name: '.marklab-sync',
      type: 'directory',
      size: 0,
      modifiedAt: '2026-10-01T00:00:00.000Z',
      etag: null,
    })
    const store = createWebDavRemoteFileStore(client, 'workspaces/alpha')
    const signal = new AbortController().signal

    await expect(store.hasSyncMetadata?.({ signal })).resolves.toBe(true)
    expect(client.stat).toHaveBeenCalledWith('workspaces/alpha/.marklab-sync', { signal })
  })

  it('returns false only when the internal metadata path is absent', async () => {
    const client = createClient()
    client.stat.mockRejectedValue(new WebDavError('NOT_FOUND'))
    const store = createWebDavRemoteFileStore(client, '/')

    await expect(store.hasSyncMetadata?.({ signal: new AbortController().signal })).resolves.toBe(
      false,
    )
  })
})

const createClient = () =>
  ({
    createDirectory: vi.fn(async () => undefined),
    customRequest: vi.fn(),
    delete: vi.fn(async () => undefined),
    downloadBuffer: vi.fn(async () => Buffer.alloc(0)),
    downloadStream: vi.fn(),
    list: vi.fn(async () => []),
    move: vi.fn(async () => undefined),
    stat: vi.fn(),
    testConnection: vi.fn(async () => ({ ok: true as const })),
    upload: vi.fn(async () => true),
  }) as unknown as WebDavRemoteClient & { stat: ReturnType<typeof vi.fn> }
