import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dismissSplashWindow, showSplashWithoutActivation } from '@electron/splashLifecycle'

const createSplash = () => {
  let destroyed = false
  let visible = false
  const splash = Object.assign(new EventEmitter(), {
    close: vi.fn(() => {
      destroyed = true
      splash.emit('closed')
    }),
    destroy: vi.fn(() => {
      destroyed = true
      splash.emit('closed')
    }),
    isDestroyed: () => destroyed,
    isVisible: () => visible,
    show: vi.fn(),
    showInactive: vi.fn(() => {
      visible = true
    }),
  })
  return splash
}

describe('splash lifecycle', () => {
  afterEach(() => vi.useRealTimers())

  it('shows without activating or forcing the splash to the foreground', () => {
    const splash = createSplash()

    showSplashWithoutActivation(splash as unknown as BrowserWindow)

    expect(splash.showInactive).toHaveBeenCalledOnce()
    expect(splash.show).not.toHaveBeenCalled()
  })

  it('destroys the splash renderer after the hide animation completes', () => {
    const splash = createSplash()
    const hide = vi.fn((_window, onHidden: () => void) => onHidden())

    dismissSplashWindow(splash as unknown as BrowserWindow, hide)

    expect(splash.destroy).toHaveBeenCalledOnce()
    expect(splash.close).not.toHaveBeenCalled()
  })

  it('destroys a lingering splash when the hide callback never arrives', () => {
    vi.useFakeTimers()
    const splash = createSplash()

    dismissSplashWindow(splash as unknown as BrowserWindow, vi.fn())
    vi.runAllTimers()

    expect(splash.destroy).toHaveBeenCalledOnce()
  })
})
