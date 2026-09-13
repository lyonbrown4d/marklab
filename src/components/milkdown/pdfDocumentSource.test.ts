import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const readAssetBytes = vi.hoisted(() => vi.fn())

vi.mock('@/services/fsApi', () => ({
  fsApi: {
    readAssetBytes,
  },
}))

import { fetchPdfDocumentData } from '@/components/milkdown/pdfDocumentSource'

beforeEach(() => {
  class ReadableBlob extends Blob {
    arrayBuffer = () =>
      new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          if (reader.result instanceof ArrayBuffer) resolve(reader.result)
          else reject(new Error('Expected binary Blob data'))
        }
        reader.onerror = () => reject(reader.error ?? new Error('Failed to read Blob'))
        reader.readAsArrayBuffer(this)
      })
  }
  vi.stubGlobal('Blob', ReadableBlob)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  readAssetBytes.mockReset()
})

describe('fetchPdfDocumentData', () => {
  it('reads authorized bytes through IPC without generating or fetching a blob URL', async () => {
    readAssetBytes.mockResolvedValueOnce({
      bytes: new Uint8Array([37, 80, 68, 70]).buffer,
      media_type: 'application/pdf',
      size_bytes: 4,
    })
    const fetchMock = vi.fn()
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL')
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchPdfDocumentData('marklab-asset://local/v1/pdf-capability#page=2'),
    ).resolves.toEqual(new Uint8Array([37, 80, 68, 70]))

    expect(readAssetBytes).toHaveBeenCalledWith('marklab-asset://local/v1/pdf-capability')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(createObjectUrl).not.toHaveBeenCalled()
  })

  it.each(['https://example.test/brief.pdf', 'data:application/pdf;base64,JVBERg=='])(
    'continues to reject external PDF sources: %s',
    async (source) => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      await expect(fetchPdfDocumentData(source)).rejects.toThrow(
        'External HTTP(S) and data PDF previews are unsupported',
      )
      expect(fetchMock).not.toHaveBeenCalled()
      expect(readAssetBytes).not.toHaveBeenCalled()
    },
  )

  it('does not read when already cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      fetchPdfDocumentData('marklab-asset://local/v1/pdf-capability', controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(readAssetBytes).not.toHaveBeenCalled()
  })

  it('discards a read completed after cancellation', async () => {
    const controller = new AbortController()
    readAssetBytes.mockImplementation(async () => {
      controller.abort()
      return { bytes: new Uint8Array([37, 80]).buffer, media_type: 'application/pdf' }
    })
    await expect(
      fetchPdfDocumentData('marklab-asset://local/v1/pdf-capability', controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('propagates expired or revoked capability errors', async () => {
    readAssetBytes.mockRejectedValue(new Error('Asset capability expired'))
    await expect(fetchPdfDocumentData('marklab-asset://local/v1/pdf-capability')).rejects.toThrow(
      'Asset capability expired',
    )
  })

  it('rejects legacy absolute-path capability URLs', async () => {
    await expect(
      fetchPdfDocumentData('marklab-asset://local/?path=D%3A%5Cdocs%5Cbrief.pdf'),
    ).rejects.toThrow('Unsupported preview asset URL')
    expect(readAssetBytes).not.toHaveBeenCalled()
  })
})
