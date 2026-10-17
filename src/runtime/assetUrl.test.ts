import { afterEach, describe, expect, it, vi } from 'vitest'
import { toWebviewAssetUrl } from '@/runtime/assetUrl'

afterEach(() => vi.unstubAllGlobals())

describe('native asset resource origins', () => {
  const capability = `marklab-asset://remote/v1/${'a'.repeat(43)}#page=2`
  it('maps only opaque capabilities for Tauri on Windows, preserving media fragments', () => {
    vi.stubGlobal('window', { marklabTauri: {} })
    vi.stubGlobal('navigator', { userAgent: 'Windows NT 10.0' })
    expect(toWebviewAssetUrl(capability)).toBe(
      `http://marklab-asset.localhost/remote/v1/${'a'.repeat(43)}#page=2`,
    )
    expect(toWebviewAssetUrl('https://example.com/image.png')).toBe('https://example.com/image.png')
    expect(toWebviewAssetUrl('marklab-asset://local/../../private')).toBe(
      'marklab-asset://local/../../private',
    )
  })
  it('retains Electron and WKWebView capability URLs', () => {
    vi.stubGlobal('window', { marklabElectron: {} })
    vi.stubGlobal('navigator', { userAgent: 'Windows NT 10.0' })
    expect(toWebviewAssetUrl(capability)).toBe(capability)
    vi.stubGlobal('window', { marklabTauri: {} })
    vi.stubGlobal('navigator', { userAgent: 'Macintosh' })
    expect(toWebviewAssetUrl(capability)).toBe(capability)
  })
})
