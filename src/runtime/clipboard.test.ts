import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DesktopRuntimeApi } from '@/runtime/desktop'
import { readClipboardText, writeClipboardContent, writeClipboardText } from '@/runtime/clipboard'

const setDesktopClipboard = (clipboard: DesktopRuntimeApi['clipboard'] | undefined) => {
  Reflect.set(window, 'marklabTauri', clipboard ? ({ clipboard } as DesktopRuntimeApi) : undefined)
}

afterEach(() => setDesktopClipboard(undefined))

describe('clipboard runtime', () => {
  it('uses named desktop methods for text and rich clipboard writes', async () => {
    const clipboard = {
      readImage: vi.fn(),
      readText: vi.fn(async () => 'read'),
      write: vi.fn(async () => ({ ok: true })),
      writeText: vi.fn(async () => ({ ok: true })),
    }
    setDesktopClipboard(clipboard)

    await expect(readClipboardText()).resolves.toBe('read')
    await writeClipboardText('plain')
    await writeClipboardContent({
      html: '<strong>rich</strong>',
      markdown: '**rich**',
      text: 'rich',
    })

    expect(clipboard.writeText).toHaveBeenCalledWith('plain')
    expect(clipboard.write).toHaveBeenCalledWith({
      html: '<strong>rich</strong>',
      markdown: '**rich**',
      text: 'rich',
    })
  })

  it('falls back to browser plain text in browser previews', async () => {
    const writeText = vi.fn(async () => undefined)
    const readText = vi.fn(async () => 'browser')
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText, writeText },
    })

    await expect(readClipboardText()).resolves.toBe('browser')
    await writeClipboardContent({ html: '<em>text</em>', markdown: '_text_', text: 'text' })

    expect(writeText).toHaveBeenCalledWith('text')
  })
})
