import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchPreviewAssetBlob } from '@/components/previews/localAssetSource'

afterEach(() => vi.unstubAllGlobals())

describe('fetchPreviewAssetBlob', () => {
  it('fetches strict local capabilities through the streaming asset protocol', async () => {
    const fetchMock = vi.fn(async () =>
      Promise.resolve(
        new Response(new Uint8Array([1, 2, 3]), {
          headers: {
            'content-type':
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          },
          status: 200,
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const blob = await fetchPreviewAssetBlob(
      'marklab-asset://local/v1/document-capability#preview',
      'application/octet-stream',
    )

    expect(fetchMock).toHaveBeenCalledWith('marklab-asset://local/v1/document-capability', {
      signal: undefined,
    })
    expect(blob.size).toBe(3)
  })

  it('rejects malformed local capabilities before fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchPreviewAssetBlob(
        'marklab-asset://local/?path=C%3A%5Cprivate.docx',
        'application/octet-stream',
      ),
    ).rejects.toThrow('Unsupported preview asset URL')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('propagates cancellation through fetch', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchPreviewAssetBlob(
        'marklab-asset://local/v1/document-capability',
        'application/octet-stream',
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects oversized materialized previews from content-length before reading the body', async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1]))
        controller.close()
      },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(body, {
            headers: { 'content-length': String(64 * 1024 * 1024 + 1) },
            status: 200,
          }),
      ),
    )

    await expect(
      fetchPreviewAssetBlob(
        'marklab-asset://local/v1/document-capability',
        'application/octet-stream',
      ),
    ).rejects.toThrow('too large')
  })

  it('rejects streamed previews whose actual bytes exceed the materialization limit', async () => {
    const chunk = new Uint8Array(1024 * 1024)
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                for (let index = 0; index < 65; index += 1) controller.enqueue(chunk)
                controller.close()
              },
            }),
            { status: 200 },
          ),
      ),
    )

    await expect(
      fetchPreviewAssetBlob(
        'marklab-asset://local/v1/document-capability',
        'application/octet-stream',
      ),
    ).rejects.toThrow('too large')
  })
})
