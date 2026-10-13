import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { revealMainWindowFromSplash } from '@electron/splashLifecycle'
import { nativeIpcChannels } from '@electron/channels'
import {
  hideWindowWithMotion,
  installWindowDragOpacity,
  showWindowWithMotion,
} from '@electron/windowMotion'

const animationSettings = vi.hoisted(() => vi.fn())
vi.mock('electron', () => ({
  systemPreferences: { getAnimationSettings: animationSettings },
}))
vi.mock('@electron/main/e2eRuntime', () => ({ isBackgroundElectronE2e: () => false }))

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!
const usePlatform = (platform: NodeJS.Platform) =>
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })

const createWindow = (visible: boolean) => {
  const state = { visible, destroyed: false, opacity: 1 }
  const bounds = { x: 100, y: 100, width: 1000, height: 700 }
  const events = Object.assign(new EventEmitter(), {
    isDestroyed: () => state.destroyed,
    isVisible: () => state.visible,
    isMinimized: () => false,
    setOpacity: vi.fn((opacity: number) => {
      state.opacity = opacity
    }),
    show: vi.fn(() => {
      state.visible = true
      events.emit('show')
    }),
    hide: vi.fn(() => {
      state.visible = false
      events.emit('hide')
    }),
    destroy: vi.fn(() => {
      state.destroyed = true
      state.visible = false
      events.emit('closed')
    }),
    focus: vi.fn(),
    webContents: { isDestroyed: () => state.destroyed, send: vi.fn() },
    getBounds: () => bounds,
    setBounds: vi.fn(),
    setPosition: vi.fn(),
    setSize: vi.fn(),
    setAlwaysOnTop: vi.fn(),
  })
  return { state, events, window: events as unknown as BrowserWindow, bounds }
}

describe('native window reveal and splash handoff', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    usePlatform('darwin')
    animationSettings.mockReset().mockReturnValue({
      prefersReducedMotion: false,
      shouldRenderRichAnimation: true,
    })
  })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    Object.defineProperty(process, 'platform', originalPlatform)
  })

  it('reveals the focused main window before splash exit finishes without a blank gap', () => {
    const main = createWindow(false)
    const splash = createWindow(true)
    revealMainWindowFromSplash(main.window, splash.window)
    expect(main.state.visible).toBe(true)
    expect(main.events.focus).toHaveBeenCalledOnce()
    expect(splash.state.destroyed).toBe(false)
    expect(main.events.webContents.send).not.toHaveBeenCalled()
    for (let elapsed = 0; elapsed < 160; elapsed += 16) {
      expect(main.state.opacity > 0 || splash.state.opacity > 0).toBe(true)
      vi.advanceTimersByTime(16)
    }
    expect(main.state.opacity).toBe(1)
    expect(splash.state.destroyed).toBe(true)
    expect(splash.events.destroy).toHaveBeenCalledOnce()
    expect(main.events.webContents.send).toHaveBeenCalledExactlyOnceWith(
      nativeIpcChannels.windowPresented,
    )
    expect(vi.getTimerCount()).toBe(0)
    for (const { events, bounds, window } of [main, splash]) {
      expect(window.getBounds()).toEqual(bounds)
      expect(events.setBounds).not.toHaveBeenCalled()
      expect(events.setPosition).not.toHaveBeenCalled()
      expect(events.setSize).not.toHaveBeenCalled()
      expect(events.setAlwaysOnTop).not.toHaveBeenCalled()
      expect(events.listenerCount('closed')).toBe(0)
    }
  })

  it('uses a fast ease-out and settles at full opacity within 128ms', () => {
    const main = createWindow(false)
    showWindowWithMotion(main.window)
    vi.advanceTimersByTime(64)
    expect(main.state.opacity).toBeGreaterThan(0.85)
    expect(main.state.opacity).toBeLessThan(1)
    vi.advanceTimersByTime(64)
    expect(main.state.opacity).toBe(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    { prefersReducedMotion: true, shouldRenderRichAnimation: true },
    { prefersReducedMotion: false, shouldRenderRichAnimation: false },
  ])('honors system animation settings %j and retains manual drag opacity', (settings) => {
    animationSettings.mockReturnValue(settings)
    const main = createWindow(false)
    const splash = createWindow(true)
    revealMainWindowFromSplash(main.window, splash.window)
    expect(main.state.visible).toBe(true)
    expect(main.state.opacity).toBe(1)
    expect(splash.state.destroyed).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    installWindowDragOpacity(main.window)
    main.events.emit('will-move')
    expect(main.state.opacity).toBe(0.85)
    vi.advanceTimersByTime(180)
    expect(main.state.opacity).toBe(1)
  })

  it('skips unsupported Linux opacity calls and dismisses the splash immediately', () => {
    usePlatform('linux')
    const main = createWindow(false)
    const splash = createWindow(true)
    revealMainWindowFromSplash(main.window, splash.window)
    expect(main.state.visible).toBe(true)
    expect(main.events.focus).toHaveBeenCalledOnce()
    expect(splash.state.destroyed).toBe(true)
    expect(main.events.setOpacity).not.toHaveBeenCalled()
    expect(splash.events.setOpacity).not.toHaveBeenCalled()
    expect(animationSettings).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('shows immediately when animation preferences cannot be read', () => {
    animationSettings.mockImplementation(() => {
      throw new Error('Animation settings unavailable')
    })
    const main = createWindow(false)
    showWindowWithMotion(main.window)
    expect(main.state.visible).toBe(true)
    expect(main.state.opacity).toBe(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reveals and focuses immediately when native opacity fails initially', () => {
    const main = createWindow(false)
    const splash = createWindow(true)
    for (const { events } of [main, splash]) {
      events.setOpacity.mockImplementation(() => {
        throw new Error('Native opacity unavailable')
      })
    }
    revealMainWindowFromSplash(main.window, splash.window)
    expect(main.state.visible).toBe(true)
    expect(main.events.focus).toHaveBeenCalledOnce()
    expect(splash.state.destroyed).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('restores full opacity and cleans up after a transient reveal failure', () => {
    const main = createWindow(false)
    showWindowWithMotion(main.window)
    main.events.setOpacity.mockImplementationOnce(() => {
      throw new Error('Compositor interrupted')
    })
    vi.advanceTimersByTime(16)
    expect(main.state.opacity).toBe(1)
    expect(vi.getTimerCount()).toBe(0)
    expect(main.events.listenerCount('closed')).toBe(0)
  })

  it('clears native fade timers when windows are destroyed during handoff', () => {
    const main = createWindow(false)
    const splash = createWindow(true)
    revealMainWindowFromSplash(main.window, splash.window)
    main.events.destroy()
    splash.events.destroy()
    expect(vi.getTimerCount()).toBe(0)
    expect(main.events.listenerCount('closed')).toBe(0)
    expect(splash.events.listenerCount('closed')).toBe(0)
  })

  it('cancels an exit when shown again so its old callback cannot hide the window', () => {
    const main = createWindow(true)
    const hidden = vi.fn()
    hideWindowWithMotion(main.window, hidden)
    vi.advanceTimersByTime(32)
    showWindowWithMotion(main.window, { focus: true })
    vi.runAllTimers()
    expect(main.state.visible).toBe(true)
    expect(main.state.opacity).toBe(1)
    expect(hidden).not.toHaveBeenCalled()
    expect(main.events.listenerCount('closed')).toBe(0)
  })

  it('completes native hiding for an already destroyed window', () => {
    const main = createWindow(true)
    main.events.destroy()
    const hidden = vi.fn()
    hideWindowWithMotion(main.window, hidden)
    expect(hidden).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('completes a pending hide when a draggable window is destroyed', () => {
    const main = createWindow(true)
    const hidden = vi.fn()
    installWindowDragOpacity(main.window)
    hideWindowWithMotion(main.window, hidden)
    main.events.destroy()
    expect(hidden).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    expect(main.events.eventNames()).toEqual([])
  })

  it('preserves a new reveal started by the hide completion callback', () => {
    const main = createWindow(true)
    hideWindowWithMotion(main.window, () => showWindowWithMotion(main.window))
    vi.advanceTimersByTime(160)
    expect(main.state.visible).toBe(true)
    expect(main.state.opacity).toBe(0)
    vi.advanceTimersByTime(32)
    expect(main.state.opacity).toBeGreaterThan(0)
    vi.runAllTimers()
    expect(main.state.opacity).toBe(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not focus or animate a main window destroyed while being shown', () => {
    const main = createWindow(false)
    main.events.show.mockImplementation(() => main.events.destroy())
    showWindowWithMotion(main.window, { focus: true })
    expect(main.events.focus).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
