import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  protocol: {
    handle: vi.fn(),
    registerSchemesAsPrivileged: vi.fn(),
  },
}))

import { createAssetProtocolHandler } from '@electron/main/assetProtocol'
import type { LinkPreviewServiceContract } from '@electron/services/linkPreview/service'

const capability = 'marklab-asset://remote/v1/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

describe('remote asset protocol', () => {
  const resolveImageCapability = vi.fn()
  const service = { resolveImageCapability } as unknown as LinkPreviewServiceContract

  beforeEach(() => vi.clearAllMocks())

  it('serves bounded image bytes from the link preview capability store', async () => {
    resolveImageCapability.mockReturnValue({
      bytes: new Uint8Array([137, 80, 78, 71]),
      mediaType: 'image/png',
    })
    const handler = createAssetProtocolHandler(
      () => null,
      () => service,
    )

    const response = await handler(new Request(capability))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]))
    expect(resolveImageCapability).toHaveBeenCalledWith(
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    )
  })

  it('supports HEAD without copying image bytes into the response body', async () => {
    resolveImageCapability.mockReturnValue({
      bytes: new Uint8Array([1, 2, 3]),
      mediaType: 'image/webp',
    })
    const handler = createAssetProtocolHandler(
      () => null,
      () => service,
    )

    const response = await handler(new Request(capability, { method: 'HEAD' }))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-length')).toBe('3')
    expect((await response.arrayBuffer()).byteLength).toBe(0)
  })

  it('rejects malformed or expired remote capabilities', async () => {
    resolveImageCapability.mockReturnValue(null)
    const handler = createAssetProtocolHandler(
      () => null,
      () => service,
    )

    await expect(handler(new Request('marklab-asset://remote/v1/short'))).resolves.toMatchObject({
      status: 404,
    })
    await expect(handler(new Request(capability))).resolves.toMatchObject({ status: 404 })
  })
})
