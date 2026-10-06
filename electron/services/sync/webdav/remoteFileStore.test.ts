import { Readable } from 'node:stream'

import { describe, expect, it, vi } from 'vitest'

import { createWebDavClientAdapter } from '@electron/services/sync/webdav/clientAdapter'
import { WebDavError } from '@electron/services/sync/webdav/errors'
import { createWebDavRemoteFileStore } from '@electron/services/sync/webdav/remoteFileStore'
import type { WebDavLibraryClient, WebDavRemoteClient } from '@electron/services/sync/webdav/types'

describe('WebDAV RemoteFileStore', () => {
  it('recursively lists files below the scoped remote root', async () => {
    const client = createClient()
    client.list.mockImplementation(async (remotePath: string) =>
      remotePath === 'workspaces/alpha'
        ? [entry('root.md'), entry('notes', 'directory')]
        : [entry('today.md')],
    )
    const store = createWebDavRemoteFileStore(client, 'workspaces/alpha')

    const results = []
    for await (const item of store.list({ signal: new AbortController().signal })) {
      results.push(item)
    }

    expect(results.map(({ path }) => path)).toEqual(['root.md', 'notes/today.md'])
    expect(client.list).toHaveBeenNthCalledWith(1, 'workspaces/alpha', expect.any(Object))
    expect(client.list).toHaveBeenNthCalledWith(2, 'workspaces/alpha/notes', expect.any(Object))
  })

  it('scopes streaming reads and conditional writes', async () => {
    const client = createClient()
    client.stat.mockResolvedValue(entry('draft.md', 'file', 'etag-after'))
    client.downloadStream.mockReturnValue(Readable.from(['document']))
    const store = createWebDavRemoteFileStore(client, 'workspaces/alpha')
    const signal = new AbortController().signal

    const read = await store.read('notes/draft.md', { signal })
    expect(await streamText(read.body)).toBe('document')
    expect(client.downloadStream).toHaveBeenCalledWith('workspaces/alpha/notes/draft.md', {
      signal,
    })

    await expect(
      store.write('notes/draft.md', Readable.from(['updated']), {
        signal,
        size: 7,
        ifMatch: 'etag-before',
      }),
    ).resolves.toEqual({ etag: 'etag-after' })
    expect(client.createDirectory).toHaveBeenCalledWith('workspaces/alpha/notes', {
      recursive: true,
      signal,
    })
    expect(client.upload).toHaveBeenCalledWith(
      'workspaces/alpha/notes/draft.md',
      expect.any(Readable),
      expect.objectContaining({
        contentLength: 7,
        headers: { 'If-Match': 'etag-before' },
        signal,
      }),
    )
  })

  it('maps delete, move, and manifest conditions without escaping the scope', async () => {
    const client = createClient()
    client.downloadBuffer.mockResolvedValue(
      Buffer.from(
        '{"version":1,"deviceId":"device","updatedAt":"2026-10-01T00:00:00.000Z","entries":[]}',
      ),
    )
    client.stat
      .mockResolvedValueOnce(entry('published.md', 'file', 'moved-etag'))
      .mockResolvedValue(entry('manifest.json', 'file', 'manifest-etag'))
    const store = createWebDavRemoteFileStore(client, 'workspaces/alpha')
    const signal = new AbortController().signal

    await store.delete('old.md', { signal, ifMatch: 'old-etag' })
    await expect(
      store.move('draft.md', 'published.md', { signal, ifNoneMatch: '*' }),
    ).resolves.toEqual({ etag: 'moved-etag' })
    await expect(store.readManifest({ signal })).resolves.toMatchObject({ etag: 'manifest-etag' })
    await store.writeManifest(
      { version: 1, deviceId: 'device', updatedAt: '2026-10-01T00:00:00.000Z', entries: [] },
      { signal, ifNoneMatch: '*' },
    )

    expect(client.delete).toHaveBeenCalledWith('workspaces/alpha/old.md', {
      headers: { 'If-Match': 'old-etag' },
      signal,
    })
    expect(client.move).toHaveBeenCalledWith(
      'workspaces/alpha/draft.md',
      'workspaces/alpha/published.md',
      { headers: { 'If-None-Match': '*' }, overwrite: false, signal },
    )
    expect(client.upload).toHaveBeenCalledWith(
      'workspaces/alpha/.marklab-sync/manifest.json',
      expect.any(Readable),
      expect.objectContaining({ headers: { 'If-None-Match': '*' }, signal }),
    )
  })

  it('returns no manifest for a missing remote and rejects traversal', async () => {
    const client = createClient()
    client.stat.mockRejectedValue(new WebDavError('NOT_FOUND'))
    const store = createWebDavRemoteFileStore(client, 'workspaces/alpha')
    const signal = new AbortController().signal

    await expect(store.readManifest({ signal })).resolves.toBeNull()
    await expect(store.read('../outside.md', { signal })).rejects.toThrow(/path/i)
    expect(() => createWebDavRemoteFileStore(client, '../outside')).toThrow(/path/i)
  })

  it('treats a not-yet-created scoped root as an empty remote', async () => {
    const client = createClient()
    client.list.mockRejectedValue(new WebDavError('NOT_FOUND'))
    const store = createWebDavRemoteFileStore(client, 'workspaces/new')
    const results = []

    for await (const item of store.list({ signal: new AbortController().signal })) {
      results.push(item)
    }

    expect(results).toEqual([])
  })

  it('supports the server base as remote root without creating a dot directory', async () => {
    const client = createClient()
    client.stat.mockResolvedValue(entry('root.md', 'file', 'root-etag'))
    const store = createWebDavRemoteFileStore(client, '/')
    const signal = new AbortController().signal

    await store.write('root.md', Readable.from(['root']), { signal, size: 4 })

    expect(client.createDirectory).not.toHaveBeenCalled()
    expect(client.upload).toHaveBeenCalledWith(
      'root.md',
      expect.any(Readable),
      expect.objectContaining({ contentLength: 4, signal }),
    )
  })

  it.each([
    ['immutable object', 'write', '.marklab-sync/objects/hash'],
    ['manifest', 'writeManifest', '.marklab-sync/manifest.json'],
  ] as const)(
    'rejects %s creation when the WebDAV library returns false',
    async (_, method, target) => {
      const library = createLibraryClient()
      library.putFileContents.mockResolvedValue(false)
      const store = createWebDavRemoteFileStore(createRealClient(library), '/')
      const signal = new AbortController().signal

      const operation =
        method === 'write'
          ? store.write(target, Readable.from(['content']), {
              signal,
              size: 7,
              ifNoneMatch: '*',
            })
          : store.writeManifest(
              {
                version: 1,
                deviceId: 'device',
                updatedAt: '2026-10-01T00:00:00.000Z',
                entries: [],
              },
              { signal, ifNoneMatch: '*' },
            )

      await expect(operation).rejects.toMatchObject({ code: 'precondition_failed' })
      expect(library.putFileContents).toHaveBeenCalledWith(
        `/${target}`,
        expect.any(Readable),
        expect.objectContaining({ overwrite: false, headers: { 'If-None-Match': '*' } }),
      )
    },
  )

  it('does not stat a failed upload reported by a WebDAV client', async () => {
    const client = createClient()
    client.upload.mockResolvedValue(false)
    const store = createWebDavRemoteFileStore(client, '/')

    await expect(
      store.write('.marklab-sync/objects/hash', Readable.from(['content']), {
        signal: new AbortController().signal,
        size: 7,
        ifNoneMatch: '*',
      }),
    ).rejects.toMatchObject({ code: 'precondition_failed' })
    expect(client.stat).not.toHaveBeenCalled()
  })

  it('rejects an oversized manifest before starting an upload', async () => {
    const client = createClient()
    const store = createWebDavRemoteFileStore(client, '/')
    const oversizedDeviceId = 'x'.repeat(4 * 1024 * 1024)

    await expect(
      store.writeManifest(
        {
          version: 1,
          deviceId: oversizedDeviceId,
          updatedAt: '2026-10-01T00:00:00.000Z',
          entries: [],
        },
        { signal: new AbortController().signal, ifNoneMatch: '*' },
      ),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    expect(client.upload).not.toHaveBeenCalled()
  })
})

const createRealClient = (client: ReturnType<typeof createLibraryClient>) =>
  createWebDavClientAdapter(
    {
      id: 'primary',
      label: 'Primary',
      endpoint: 'https://dav.example.com',
      basePath: '/',
      username: '',
      allowInsecureLocal: false,
      sessionOnly: false,
      hasPassword: false,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    },
    null,
    { createClient: vi.fn(() => client as unknown as WebDavLibraryClient) },
  )

const createLibraryClient = () => ({
  createDirectory: vi.fn(async () => undefined),
  customRequest: vi.fn(),
  deleteFile: vi.fn(async () => undefined),
  getDirectoryContents: vi.fn(async () => []),
  getFileContents: vi.fn(async () => new Uint8Array()),
  createReadStream: vi.fn(),
  moveFile: vi.fn(async () => undefined),
  putFileContents: vi.fn(async () => true),
  stat: vi.fn<WebDavLibraryClient['stat']>(async () => ({
    filename: '/',
    basename: '',
    lastmod: '',
    size: 0,
    type: 'file' as const,
    etag: null,
  })),
})

const createClient = () =>
  ({
    createDirectory: vi.fn(async () => undefined),
    customRequest: vi.fn(),
    delete: vi.fn(async () => undefined),
    downloadBuffer: vi.fn(async () => Buffer.alloc(0)),
    downloadStream: vi.fn(() => Readable.from([])),
    list: vi.fn(async () => []),
    move: vi.fn(async () => undefined),
    stat: vi.fn(async () => entry('file.md')),
    testConnection: vi.fn(async () => ({ ok: true as const })),
    upload: vi.fn(async () => true),
  }) as unknown as WebDavRemoteClient & Record<keyof WebDavRemoteClient, ReturnType<typeof vi.fn>>

const entry = (name: string, type: 'file' | 'directory' = 'file', etag = 'etag') => ({
  path: name,
  name,
  type,
  size: type === 'file' ? 8 : 0,
  modifiedAt: '2026-10-01T00:00:00.000Z',
  etag,
})

const streamText = async (stream: Readable): Promise<string> => {
  const chunks = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}
