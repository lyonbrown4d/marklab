import { describe, expect, it, vi } from 'vitest'

import { createWebDavClientAdapter } from '@electron/services/sync/webdav/clientAdapter.js'
import type { WebDavLibraryClient } from '@electron/services/sync/webdav/types.js'

describe('WebDavClientAdapter', () => {
  it('locks requests to the configured base path and rejects traversal', async () => {
    const library = createLibraryClient()
    const adapter = createAdapter(library)

    await adapter.stat('notes/today.md')
    await expect(adapter.stat('../secret.md')).rejects.toMatchObject({ code: 'INVALID_PATH' })
    await expect(adapter.stat('%2e%2e/secret.md')).rejects.toMatchObject({
      code: 'INVALID_PATH',
    })

    expect(library.stat).toHaveBeenCalledWith('/notes/today.md', expect.any(Object))
    expect(library.stat).toHaveBeenCalledTimes(1)
  })

  it('normalizes authentication failures without leaking credentials', async () => {
    const library = createLibraryClient()
    library.stat.mockRejectedValueOnce(Object.assign(new Error('alice:secret'), { status: 401 }))
    const adapter = createAdapter(library)

    await expect(adapter.testConnection()).resolves.toEqual({
      ok: false,
      code: 'AUTHENTICATION_FAILED',
      message: 'WebDAV authentication failed.',
    })
    expect(JSON.stringify(await adapter.testConnection())).not.toContain('secret')
  })

  it('maps forbidden, timeout, and caller abort errors', async () => {
    const forbidden = createLibraryClient()
    forbidden.stat.mockRejectedValueOnce(Object.assign(new Error('forbidden'), { status: 403 }))
    await expect(createAdapter(forbidden).stat('notes')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })

    const precondition = createLibraryClient()
    precondition.stat.mockRejectedValueOnce(Object.assign(new Error(), { status: 412 }))
    await expect(createAdapter(precondition).stat('notes')).rejects.toMatchObject({
      code: 'precondition_failed',
    })

    const timeout = createLibraryClient()
    timeout.stat.mockImplementation((_path: string, options?: { signal?: AbortSignal }) =>
      rejectWhenAborted(options?.signal),
    )
    await expect(createAdapter(timeout).stat('notes', { timeoutMs: 1 })).rejects.toMatchObject({
      code: 'TIMEOUT',
    })

    const aborted = createLibraryClient()
    aborted.stat.mockImplementation((_path: string, options?: { signal?: AbortSignal }) =>
      rejectWhenAborted(options?.signal),
    )
    const controller = new AbortController()
    controller.abort()
    await expect(
      createAdapter(aborted).stat('notes', { signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'ABORTED' })
  })

  it('maps a rejected conditional upload result to a precondition failure', async () => {
    const library = createLibraryClient()
    library.putFileContents.mockResolvedValueOnce(false)
    const adapter = createAdapter(library)

    await expect(
      adapter.upload('objects/hash', Buffer.from('content'), { overwrite: false }),
    ).rejects.toMatchObject({ code: 'precondition_failed' })
  })

  it('quotes opaque entity tags while preserving the If-Match wildcard', async () => {
    const library = createLibraryClient()
    const adapter = createAdapter(library)

    await adapter.upload('objects/hash', Buffer.from('content'), {
      headers: { 'If-Match': 'etag-from-propfind' },
    })
    await adapter.delete('objects/hash', { headers: { 'If-Match': '*' } })

    expect(library.putFileContents).toHaveBeenCalledWith(
      '/objects/hash',
      expect.any(Buffer),
      expect.objectContaining({ headers: { 'If-Match': '"etag-from-propfind"' } }),
    )
    expect(library.deleteFile).toHaveBeenCalledWith(
      '/objects/hash',
      expect.objectContaining({ headers: { 'If-Match': '*' } }),
    )
  })

  it('rejects cross-origin custom responses and caller-supplied authorization', async () => {
    const library = createLibraryClient()
    library.customRequest.mockResolvedValueOnce(response('https://evil.example/file'))
    const adapter = createAdapter(library)

    await expect(adapter.customRequest('notes/today.md', { method: 'HEAD' })).rejects.toMatchObject(
      { code: 'ORIGIN_MISMATCH' },
    )
    await expect(
      adapter.customRequest('notes/today.md', {
        method: 'HEAD',
        headers: { Authorization: 'Bearer attacker-controlled' },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
  })
})

const createAdapter = (client: ReturnType<typeof createLibraryClient>) =>
  createWebDavClientAdapter(
    {
      id: 'primary',
      label: 'Primary',
      endpoint: 'https://dav.example.com',
      basePath: '/remote.php/dav',
      username: 'alice',
      allowInsecureLocal: false,
      sessionOnly: false,
      hasPassword: true,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    },
    'secret',
    { createClient: vi.fn(() => client as unknown as WebDavLibraryClient), defaultTimeoutMs: 50 },
  )

const createLibraryClient = () => ({
  customRequest: vi.fn(),
  deleteFile: vi.fn(),
  getDirectoryContents: vi.fn(async () => []),
  getFileContents: vi.fn(async () => new Uint8Array()),
  createReadStream: vi.fn(),
  moveFile: vi.fn(),
  putFileContents: vi.fn(async () => true),
  stat: vi.fn<WebDavLibraryClient['stat']>(async () => ({
    filename: '/',
    basename: '',
    lastmod: '',
    size: 0,
    type: 'directory' as const,
    etag: null,
  })),
})

const rejectWhenAborted = (signal?: AbortSignal): Promise<never> =>
  new Promise((_resolve, reject) => {
    const rejectAbort = () => reject(new DOMException('aborted', 'AbortError'))
    if (signal?.aborted) rejectAbort()
    else signal?.addEventListener('abort', rejectAbort, { once: true })
  })

const response = (url: string) => ({
  url,
  ok: true,
  status: 200,
  statusText: 'OK',
  headers: { get: () => null, forEach: vi.fn() },
  arrayBuffer: async () => new ArrayBuffer(0),
  text: async () => '',
})
