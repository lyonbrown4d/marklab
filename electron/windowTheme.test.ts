import { describe, expect, it, vi } from 'vitest'
import {
  resolveNativeWindowBackground,
  syncNativeWindowBackgrounds,
} from '@electron/windowTheme.js'

describe('native window theme backgrounds', () => {
  it('uses editor-compatible light and dark colors', () => {
    expect(resolveNativeWindowBackground(false)).toBe('#faf9f7')
    expect(resolveNativeWindowBackground(true)).toBe('#171717')
  })

  it('updates every live window and skips destroyed windows', () => {
    const main = { isDestroyed: () => false, setBackgroundColor: vi.fn() }
    const splash = { isDestroyed: () => true, setBackgroundColor: vi.fn() }

    syncNativeWindowBackgrounds({ main, splash }, true)

    expect(main.setBackgroundColor).toHaveBeenCalledWith('#171717')
    expect(splash.setBackgroundColor).not.toHaveBeenCalled()
  })
})
