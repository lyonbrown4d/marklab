import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { revealMainWindowFromSplash } from '@electron/splashLifecycle'
import { nativeIpcChannels } from '@electron/channels'

vi.mock('electron', () => ({
  systemPreferences: {
    getAnimationSettings: () => ({
      prefersReducedMotion: true,
      shouldRenderRichAnimation: false,
    }),
  },
}))
const backgroundE2e = vi.hoisted(() => vi.fn(() => false))
vi.mock('@electron/main/e2eRuntime', () => ({ isBackgroundElectronE2e: backgroundE2e }))

const createWindow = (visible: boolean) => {
  const state = { visible, destroyed: false }
  const events = Object.assign(new EventEmitter(), {
    isDestroyed: () => state.destroyed,
    isVisible: () => state.visible,
    setOpacity: vi.fn(),
    show: vi.fn(() => {
      // Model Electron returning isVisible before the native show event arrives.
      state.visible = true
    }),
    hide: vi.fn(() => {
      state.visible = false
    }),
    focus: vi.fn(),
    webContents: { isDestroyed: () => state.destroyed, send: vi.fn() },
    destroy: vi.fn(() => {
      state.destroyed = true
      state.visible = false
      events.emit('closed')
    }),
  })
  return { state, events, window: events as unknown as BrowserWindow }
}

describe('native show event before splash dismissal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    backgroundE2e.mockReturnValue(false)
  })
  afterEach(() => vi.useRealTimers())

  it('retains the splash until the actual main show event even when isVisible returns true', () => {
    const main = createWindow(false)
    const splash = createWindow(true)
    revealMainWindowFromSplash(main.window, splash.window)
    expect(main.state.visible).toBe(true)
    vi.advanceTimersByTime(500)
    expect(splash.state.visible).toBe(true)
    expect(splash.state.destroyed).toBe(false)
    expect(main.events.webContents.send).not.toHaveBeenCalled()
    main.events.emit('show')
    expect(splash.state.destroyed).toBe(true)
    expect(main.events.eventNames()).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
    main.events.emit('show')
    main.events.emit('closed')
    expect(splash.events.destroy).toHaveBeenCalledOnce()
    expect(main.events.webContents.send).toHaveBeenCalledExactlyOnceWith(
      nativeIpcChannels.windowPresented,
    )
  })

  it('dismisses immediately for an already visible main window', () => {
    const main = createWindow(true)
    const splash = createWindow(true)
    revealMainWindowFromSplash(main.window, splash.window)
    expect(main.events.show).not.toHaveBeenCalled()
    expect(main.events.focus).toHaveBeenCalledOnce()
    expect(splash.state.destroyed).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('dismisses a lingering splash if native show never reports within one second', () => {
    const main = createWindow(false)
    const splash = createWindow(true)
    revealMainWindowFromSplash(main.window, splash.window)
    vi.advanceTimersByTime(999)
    expect(splash.state.destroyed).toBe(false)
    vi.advanceTimersByTime(1)
    expect(splash.state.destroyed).toBe(true)
    expect(main.events.eventNames()).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cleans up the pending show subscription when main closes early', () => {
    const main = createWindow(false)
    const splash = createWindow(true)
    revealMainWindowFromSplash(main.window, splash.window)
    main.events.destroy()
    expect(splash.state.destroyed).toBe(true)
    expect(main.events.eventNames()).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([false, true])('contains focus errors for visible=%s and releases splash', (visible) => {
    const main = createWindow(visible)
    const splash = createWindow(true)
    main.events.focus.mockImplementation(() => {
      throw new Error('Native focus unavailable')
    })
    expect(() => revealMainWindowFromSplash(main.window, splash.window)).not.toThrow()
    expect(splash.state.destroyed).toBe(true)
    expect(main.events.eventNames()).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('handles a main window destroyed before presentation', () => {
    const main = createWindow(false)
    const splash = createWindow(true)
    main.events.destroy()
    revealMainWindowFromSplash(main.window, splash.window)
    expect(main.events.show).not.toHaveBeenCalled()
    expect(splash.state.destroyed).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    expect(main.events.webContents.send).not.toHaveBeenCalled()
  })

  it('waits for asynchronous splash closed before notifying the primary renderer once', () => {
    const main = createWindow(false)
    const splash = createWindow(true)
    splash.events.destroy.mockImplementation(() => {
      splash.state.destroyed = true
    })
    revealMainWindowFromSplash(main.window, splash.window)
    main.events.emit('show')
    expect(main.events.webContents.send).not.toHaveBeenCalled()
    splash.events.emit('closed')
    splash.events.emit('closed')
    expect(main.events.webContents.send).toHaveBeenCalledExactlyOnceWith(
      nativeIpcChannels.windowPresented,
    )
    expect(vi.getTimerCount()).toBe(0)
    expect(main.events.eventNames()).toEqual([])
    expect(splash.events.eventNames()).toEqual([])
  })

  it('delivers primary background-test presentation after splash exit without showing main', () => {
    backgroundE2e.mockReturnValue(true)
    const main = createWindow(false)
    const splash = createWindow(true)
    revealMainWindowFromSplash(main.window, splash.window)
    expect(splash.state.destroyed).toBe(true)
    expect(main.events.show).not.toHaveBeenCalled()
    expect(main.events.webContents.send).toHaveBeenCalledExactlyOnceWith(
      nativeIpcChannels.windowPresented,
    )
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not report presentation when native showing fails before visibility', () => {
    const main = createWindow(false)
    const splash = createWindow(true)
    main.events.show.mockImplementation(() => {
      throw new Error('Native show failed')
    })
    expect(() => revealMainWindowFromSplash(main.window, splash.window)).not.toThrow()
    expect(splash.state.destroyed).toBe(true)
    expect(main.events.webContents.send).not.toHaveBeenCalled()
    expect(main.events.eventNames()).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })
})
