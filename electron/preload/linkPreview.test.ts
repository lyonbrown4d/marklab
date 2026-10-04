import { describe, expect, it, vi } from 'vitest'

import { nativeIpcChannels } from '@electron/channels.js'
import { createLinkPreviewPreloadSurface } from '@electron/preload/linkPreview.js'

describe('link preview preload surface', () => {
  it('uses the named channel and validates the result', async () => {
    const result = {
      canonical: null,
      description: 'A page',
      favicon: null,
      image: null,
      kind: 'webpage' as const,
      site_name: 'Example',
      title: 'Title',
      url: 'https://example.com/',
    }
    const invoke = vi.fn(async () => result)
    const surface = createLinkPreviewPreloadSurface({ invoke } as never)

    await expect(surface.fetch('https://example.com')).resolves.toEqual(result)
    expect(invoke).toHaveBeenCalledWith(nativeIpcChannels.linkPreviewFetch, {
      url: 'https://example.com',
    })
  })

  it('rejects malformed backend responses', async () => {
    const surface = createLinkPreviewPreloadSurface({
      invoke: vi.fn(async () => ({ kind: 'image', url: 'https://example.com/image' })),
    } as never)

    await expect(surface.fetch('https://example.com/image')).rejects.toThrow(
      'Invalid linkPreview.fetch response',
    )
  })

  it('captures a visual preview through a separate validated channel', async () => {
    const result = {
      height: 360,
      src: 'marklab-asset://remote/v1/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      url: 'https://example.com/',
      width: 640,
    }
    const invoke = vi.fn(async () => result)
    const surface = createLinkPreviewPreloadSurface({ invoke } as never)

    await expect(surface.capture('https://example.com')).resolves.toEqual(result)
    expect(invoke).toHaveBeenCalledWith(nativeIpcChannels.linkPreviewCapture, {
      url: 'https://example.com',
    })
  })
})
