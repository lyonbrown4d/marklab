import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'

import { describe, expect, it, vi } from 'vitest'

import type { RemoteFileStore } from '@electron/services/sync/core/types'
import { scanRemoteStore } from '@electron/services/sync/webdavSync/remoteScanner'

describe('scanRemoteStore', () => {
  it('filters the internal manifest before applying the protected path policy', async () => {
    const body = Buffer.from('note')
    const read = vi.fn(async (filePath: string) => ({
      path: filePath,
      body: Readable.from([body]),
      size: body.length,
      modifiedAt: '2026-01-01T00:00:00.000Z',
    }))
    const remote = {
      list: async function* () {
        yield {
          path: '.marklab-sync/manifest.json',
          size: 100,
          modifiedAt: '2026-01-01T00:00:00.000Z',
        }
        yield {
          path: '.marklab-sync/objects/deadbeef',
          size: 4,
          modifiedAt: '2026-01-01T00:00:00.000Z',
        }
        yield {
          path: 'note.md',
          size: body.length,
          modifiedAt: '2026-01-01T00:00:00.000Z',
        }
      },
      read,
    } as unknown as RemoteFileStore

    const result = await scanRemoteStore(remote, {
      maxFileSize: 1024,
      signal: new AbortController().signal,
    })

    expect(read).toHaveBeenCalledOnce()
    expect(result.internalMetadataFound).toBe(true)
    expect(result.entries).toEqual([
      expect.objectContaining({
        path: 'note.md',
        hash: createHash('sha256').update(body).digest('hex'),
      }),
    ])
  })
})
