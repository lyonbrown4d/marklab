import { afterEach, describe, expect, it, vi } from 'vitest'
import { readPreviewTextAsset } from '@/services/readPreviewAsset'

afterEach(() => vi.unstubAllGlobals())
describe('immutable text preview assets', () => {
  it('reads the exact selected asset and preserves Unicode content', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('历史版本 🙂\n'))
    vi.stubGlobal('fetch', fetch)
    await expect(readPreviewTextAsset('marklab-asset://local/version')).resolves.toEqual({
      content: '历史版本 🙂\n',
      truncated: false,
    })
    expect(fetch).toHaveBeenCalledWith('marklab-asset://local/version', undefined)
  })
  it('bounds source requests with HTTP ranges and safely omits incomplete trailing UTF-8', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([0xe6, 0x96]), {
        status: 206,
        headers: { 'content-range': 'bytes 0-1/3' },
      }),
    )
    vi.stubGlobal('fetch', fetch)
    await expect(readPreviewTextAsset('marklab-asset://local/version', 2)).resolves.toEqual({
      content: '',
      truncated: true,
    })
    expect(fetch).toHaveBeenCalledWith('marklab-asset://local/version', {
      headers: { Range: 'bytes=0-1' },
    })
  })
  it('fails rather than loading a missing or oversized response as another file', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response('too many bytes'))
    vi.stubGlobal('fetch', fetch)
    await expect(readPreviewTextAsset('missing')).rejects.toThrow('Unable to read')
    await expect(readPreviewTextAsset('oversized', 2)).rejects.toThrow('byte limit')
  })
  it('refuses invalid UTF-8 without replacing bytes with corrupt text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([0xff]))))
    await expect(readPreviewTextAsset('invalid')).rejects.toThrow()
  })
})
