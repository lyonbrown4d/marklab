import { afterEach, describe, expect, it, vi } from 'vitest'

const readAssetBytes = vi.hoisted(() => vi.fn())

vi.mock('@/services/fsApi', () => ({
  fsApi: {
    readAssetBytes,
  },
}))

import { fetchPdfObjectUrl } from '@/components/milkdown/pdfObjectUrlSource'

afterEach(() => {
  vi.restoreAllMocks()
  readAssetBytes.mockReset()
})

describe('fetchPdfObjectUrl', () => {
  it('reads marklab asset bytes through IPC and exposes a blob URL for pdf.js', async () => {
    readAssetBytes.mockResolvedValueOnce({
      bytes: new Uint8Array([37, 80, 68, 70]).buffer,
      media_type: 'application/pdf',
      size_bytes: 4,
    })
    const fetchMock = vi.fn()
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:marklab-pdf')
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchPdfObjectUrl('marklab-asset://local/?path=D%3A%5Cdocs%5Cbrief.pdf'),
    ).resolves.toBe('blob:marklab-pdf')

    expect(readAssetBytes).toHaveBeenCalledWith(String.raw`D:\docs\brief.pdf`)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob))
  })

  it('fetches non-local assets normally', async () => {
    const fetchMock = vi.fn(
      async () => new Response(new Blob(['%PDF'], { type: 'application/pdf' })),
    )
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:marklab-pdf')
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchPdfObjectUrl('https://example.test/brief.pdf')).resolves.toBe(
      'blob:marklab-pdf',
    )

    expect(fetchMock).toHaveBeenCalledWith('https://example.test/brief.pdf', {
      signal: undefined,
    })
    expect(readAssetBytes).not.toHaveBeenCalled()
    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob))
  })

  it('reports non-successful remote responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Forbidden', { status: 403 })),
    )

    await expect(fetchPdfObjectUrl('https://example.test/brief.pdf')).rejects.toThrow(
      'Failed to fetch asset: 403',
    )
  })
})
