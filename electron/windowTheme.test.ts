import { describe, expect, it, vi } from 'vitest'
import {
  resolveNativeWindowBackground,
  syncNativeWindowBackgrounds,
  syncNativeWindowIcons,
} from '@electron/windowTheme'

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

  it('updates the icon of every live Windows or Linux window', () => {
    const main = { isDestroyed: () => false, setIcon: vi.fn() }
    const splash = { isDestroyed: () => true, setIcon: vi.fn() }
    const icon = { kind: 'dark' } as unknown as Electron.NativeImage

    syncNativeWindowIcons({ main, splash }, icon, 'linux')

    expect(main.setIcon).toHaveBeenCalledWith(icon)
    expect(splash.setIcon).not.toHaveBeenCalled()
  })

  it('keeps the packaged macOS application icon stable', () => {
    const main = { isDestroyed: () => false, setIcon: vi.fn() }
    const splash = { isDestroyed: () => false, setIcon: vi.fn() }
    const icon = { kind: 'dark' } as unknown as Electron.NativeImage

    syncNativeWindowIcons({ main, splash }, icon, 'darwin')

    expect(main.setIcon).not.toHaveBeenCalled()
    expect(splash.setIcon).not.toHaveBeenCalled()
  })
})
