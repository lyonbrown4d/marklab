import { describe, expect, it, vi } from 'vitest'
import { nativeIpcChannels } from '@electron/channels'
import { createClipboardPreloadSurface } from '@electron/preload/clipboard'

describe('clipboard preload surface', () => {
  it('uses named channels for rich writes and plain-text reads', async () => {
    const invoke = vi.fn(async (channel: string) =>
      channel === nativeIpcChannels.clipboardReadText ? 'clipboard text' : { ok: true },
    )
    const surface = createClipboardPreloadSurface({ invoke })
    const content = { html: '<strong>text</strong>', markdown: '**text**', text: 'text' }

    await expect(surface.readText()).resolves.toBe('clipboard text')
    await expect(surface.write(content)).resolves.toEqual({ ok: true })

    expect(invoke).toHaveBeenCalledWith(nativeIpcChannels.clipboardReadText)
    expect(invoke).toHaveBeenCalledWith(nativeIpcChannels.clipboardWrite, content)
  })
})
