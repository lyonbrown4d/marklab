import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nativeIpcChannels } from '@electron/channels'
import {
  installWindowDragOpacity,
  notifyWindowPresented,
  showWindowWithMotion,
} from '@electron/windowMotion'

const backgroundE2e = vi.hoisted(() => vi.fn(() => false))
const animationSettings = vi.hoisted(() => vi.fn())
vi.mock('@electron/main/e2eRuntime', () => ({ isBackgroundElectronE2e: backgroundE2e }))
vi.mock('electron', () => ({
  systemPreferences: { getAnimationSettings: animationSettings },
}))

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!
const createWindow = (visible = false) => {
  const state = { visible, destroyed: false, contentsDestroyed: false, opacity: 1 }
  const events = Object.assign(new EventEmitter(), {
    isDestroyed: () => state.destroyed,
    isVisible: () => state.visible,
    isMinimized: () => false,
    setOpacity: vi.fn((opacity: number) => {
      state.opacity = opacity
    }),
    show: vi.fn(() => {
      state.visible = true
    }),
    focus: vi.fn(),
    webContents: { isDestroyed: () => state.contentsDestroyed, send: vi.fn() },
  })
  return { state, events, window: events as unknown as BrowserWindow }
}

describe('native window presentation notification', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    backgroundE2e.mockReturnValue(false)
    animationSettings.mockReturnValue({
      prefersReducedMotion: true,
      shouldRenderRichAnimation: false,
    })
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
  })
  afterEach(() => {
    vi.useRealTimers()
    Object.defineProperty(process, 'platform', originalPlatform)
  })

  it('sends one void notification only after the actual native show event', () => {
    const { window, events } = createWindow()
    showWindowWithMotion(window)
    expect(events.webContents.send).not.toHaveBeenCalled()
    events.emit('show')
    events.emit('show')
    expect(events.webContents.send).toHaveBeenCalledExactlyOnceWith(
      nativeIpcChannels.windowPresented,
    )
    expect(events.eventNames()).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('notifies an already visible window immediately', () => {
    const { window, events } = createWindow(true)
    showWindowWithMotion(window)
    expect(events.webContents.send).toHaveBeenCalledExactlyOnceWith(
      nativeIpcChannels.windowPresented,
    )
    expect(events.show).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([false, true])('defers notification without listeners for visible=%s', (visible) => {
    const { window, events } = createWindow(visible)
    showWindowWithMotion(window, { deferPresentation: true })
    events.emit('show')
    expect(events.webContents.send).not.toHaveBeenCalled()
    expect(events.eventNames()).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps background tests hidden while delivering presentation unless deferred', () => {
    backgroundE2e.mockReturnValue(true)
    const { window, events } = createWindow()
    showWindowWithMotion(window)
    expect(events.webContents.send).toHaveBeenCalledOnce()
    expect(events.show).not.toHaveBeenCalled()
    events.webContents.send.mockClear()
    showWindowWithMotion(window, { deferPresentation: true })
    expect(events.webContents.send).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('delivers Linux presentation after native show without opacity calls', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
    const { window, events } = createWindow()
    showWindowWithMotion(window)
    expect(events.webContents.send).not.toHaveBeenCalled()
    events.emit('show')
    expect(events.webContents.send).toHaveBeenCalledOnce()
    expect(events.setOpacity).not.toHaveBeenCalled()
  })

  it.each(['closed', 'hide'])('cleans up an interrupted show on %s', (event) => {
    const { window, events, state } = createWindow()
    showWindowWithMotion(window)
    state.destroyed = event === 'closed'
    state.visible = false
    events.emit(event)
    events.emit('show')
    expect(events.webContents.send).not.toHaveBeenCalled()
    expect(events.eventNames()).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cleans up pending native show listeners when showing throws', () => {
    const { window, events } = createWindow()
    events.show.mockImplementation(() => {
      throw new Error('Native show failed')
    })
    expect(() => showWindowWithMotion(window)).toThrow('Native show failed')
    expect(events.eventNames()).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('restores a visible main to full opacity when native focus fails after showing', () => {
    animationSettings.mockReturnValue({
      prefersReducedMotion: false,
      shouldRenderRichAnimation: true,
    })
    const { window, events, state } = createWindow()
    events.focus.mockImplementation(() => {
      throw new Error('Native focus failed')
    })
    expect(() => showWindowWithMotion(window, { focus: true })).toThrow('Native focus failed')
    expect(state.visible).toBe(true)
    expect(state.opacity).toBe(1)
    expect(events.webContents.send).not.toHaveBeenCalled()
    expect(events.eventNames()).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('falls back after one second for a visible surface whose native event is missing', () => {
    const { window, events } = createWindow()
    showWindowWithMotion(window)
    vi.advanceTimersByTime(999)
    expect(events.webContents.send).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(events.webContents.send).toHaveBeenCalledOnce()
    expect(events.eventNames()).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('releases the fallback without notifying when native visibility never arrives', () => {
    const { window, events, state } = createWindow()
    showWindowWithMotion(window)
    state.visible = false
    vi.advanceTimersByTime(1000)
    expect(events.webContents.send).not.toHaveBeenCalled()
    expect(events.eventNames()).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels an earlier notification when a new deferred presentation takes over', () => {
    const { window, events } = createWindow()
    showWindowWithMotion(window)
    showWindowWithMotion(window, { deferPresentation: true })
    events.emit('show')
    expect(events.webContents.send).not.toHaveBeenCalled()
    expect(events.eventNames()).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('contains renderer delivery failures and ignores destroyed windows or web contents', () => {
    const { window, events, state } = createWindow(true)
    state.destroyed = true
    notifyWindowPresented(window)
    showWindowWithMotion(window)
    state.destroyed = false
    state.contentsDestroyed = true
    notifyWindowPresented(window)
    expect(events.webContents.send).not.toHaveBeenCalled()
    state.contentsDestroyed = false
    events.webContents.send.mockImplementation(() => {
      throw new Error('Renderer exited during delivery')
    })
    expect(() => notifyWindowPresented(window)).not.toThrow()
  })

  it('never sends presentation notifications from manual native drag opacity', () => {
    const { window, events } = createWindow(true)
    installWindowDragOpacity(window)
    events.emit('will-move')
    events.emit('move')
    vi.advanceTimersByTime(180)
    expect(events.webContents.send).not.toHaveBeenCalled()
  })
})
