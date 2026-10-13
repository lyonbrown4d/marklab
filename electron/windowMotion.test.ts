import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  hideWindowWithMotion,
  installWindowDragOpacity,
  showWindowWithMotion,
} from '@electron/windowMotion'

const backgroundE2e = vi.hoisted(() => vi.fn(() => false))
vi.mock('@electron/main/e2eRuntime', () => ({ isBackgroundElectronE2e: backgroundE2e }))
vi.mock('electron', () => ({
  systemPreferences: {
    getAnimationSettings: () => ({
      prefersReducedMotion: false,
      shouldRenderRichAnimation: true,
    }),
  },
}))

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!
const usePlatform = (platform: NodeJS.Platform) =>
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
const createWindow = () => {
  const state = { destroyed: false, visible: true, minimized: false, opacity: 1 }
  const events = Object.assign(new EventEmitter(), {
    isDestroyed: () => state.destroyed,
    isVisible: () => state.visible,
    isMinimized: () => state.minimized,
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
    focus: vi.fn(),
    webContents: { isDestroyed: () => state.destroyed, send: vi.fn() },
  })
  return { state, events, window: events as unknown as BrowserWindow }
}

describe('window opacity during native dragging', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    backgroundE2e.mockReturnValue(false)
    usePlatform('darwin')
  })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    Object.defineProperty(process, 'platform', originalPlatform)
  })

  it('keeps a continuously moving Mac window at 85% and restores after 180ms of idle', () => {
    const { window, events, state } = createWindow()
    installWindowDragOpacity(window)
    events.emit('will-move')
    expect(state.opacity).toBe(0.85)
    for (let frame = 0; frame < 5; frame++) {
      vi.advanceTimersByTime(100)
      events.emit('move')
      events.emit('moved')
      expect(state.opacity).toBe(0.85)
    }
    vi.advanceTimersByTime(179)
    expect(state.opacity).toBe(0.85)
    vi.advanceTimersByTime(1)
    expect(state.opacity).toBe(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps Windows dragging transparent even when movement pauses and restores on moved', () => {
    usePlatform('win32')
    const { window, events, state } = createWindow()
    installWindowDragOpacity(window)
    events.emit('will-move')
    events.emit('move')
    vi.advanceTimersByTime(10_000)
    expect(state.opacity).toBe(0.85)
    events.emit('moved')
    expect(state.opacity).toBe(1)
  })

  it('leaves Linux unchanged without listeners or timers', () => {
    usePlatform('linux')
    const { window, events } = createWindow()
    installWindowDragOpacity(window)
    events.emit('will-move')
    events.emit('move')
    expect(events.setOpacity).not.toHaveBeenCalled()
    expect(events.eventNames()).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not fade programmatic moves or resize events', () => {
    const { window, events } = createWindow()
    installWindowDragOpacity(window)
    events.emit('move')
    events.emit('moved')
    events.emit('resize')
    expect(events.setOpacity).not.toHaveBeenCalled()
  })

  it.each(['blur', 'hide', 'minimize', 'maximize', 'enter-full-screen', 'close'])(
    'restores an interrupted drag on %s and cancels its pending restore',
    (event) => {
      const { window, events, state } = createWindow()
      installWindowDragOpacity(window)
      events.emit('will-move')
      events.emit(event)
      expect(state.opacity).toBe(1)
      expect(vi.getTimerCount()).toBe(0)
      events.setOpacity.mockClear()
      events.emit('move')
      vi.runAllTimers()
      expect(events.setOpacity).not.toHaveBeenCalled()
    },
  )

  it.each(['visible', 'minimized'] as const)(
    'ignores a %s window unsuitable for dragging',
    (key) => {
      const { window, events, state } = createWindow()
      state[key] = key === 'minimized'
      installWindowDragOpacity(window)
      events.emit('will-move')
      expect(events.setOpacity).not.toHaveBeenCalled()
    },
  )

  it('installs once and releases listeners and timers on destruction', () => {
    const { window, events, state } = createWindow()
    installWindowDragOpacity(window)
    installWindowDragOpacity(window)
    events.emit('will-move')
    expect(events.setOpacity).toHaveBeenCalledOnce()
    state.destroyed = true
    events.emit('closed')
    expect(vi.getTimerCount()).toBe(0)
    expect(events.eventNames()).toEqual([])
    expect(events.setOpacity).toHaveBeenCalledOnce()
    installWindowDragOpacity(window)
    expect(events.eventNames()).toEqual([])
  })

  it('contains native opacity failures without leaving a restore timer', () => {
    const { window, events } = createWindow()
    events.setOpacity.mockImplementation(() => {
      throw new Error('Unsupported compositor')
    })
    installWindowDragOpacity(window)
    expect(() => events.emit('will-move')).not.toThrow()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('restores each window independently', () => {
    const first = createWindow()
    const second = createWindow()
    installWindowDragOpacity(first.window)
    installWindowDragOpacity(second.window)
    first.events.emit('will-move')
    second.events.emit('will-move')
    first.events.emit('blur')
    expect(first.state.opacity).toBe(1)
    expect(second.state.opacity).toBe(0.85)
    vi.advanceTimersByTime(180)
    expect(second.state.opacity).toBe(1)
  })

  it('cancels an active fade-in before dragging so its timer cannot overwrite drag opacity', () => {
    const { window, events, state } = createWindow()
    state.visible = false
    installWindowDragOpacity(window)
    showWindowWithMotion(window, { focus: true })
    vi.advanceTimersByTime(32)
    expect(state.opacity).toBeLessThan(0.85)
    events.emit('will-move')
    vi.advanceTimersByTime(140)
    expect(state.opacity).toBe(0.85)
    vi.advanceTimersByTime(40)
    expect(state.opacity).toBe(1)
  })

  it('allows fade-out to finish without a drag timer restoring opacity mid-animation', () => {
    const { window, events, state } = createWindow()
    const hidden = vi.fn()
    installWindowDragOpacity(window)
    events.emit('will-move')
    hideWindowWithMotion(window, hidden)
    vi.advanceTimersByTime(100)
    expect(state.opacity).toBeLessThan(0.85)
    vi.runAllTimers()
    expect(state.visible).toBe(false)
    expect(state.opacity).toBe(0)
    expect(hidden).toHaveBeenCalledOnce()
  })

  it('restores an existing visible window when explicitly shown during a drag', () => {
    const { window, events, state } = createWindow()
    installWindowDragOpacity(window)
    events.emit('will-move')
    showWindowWithMotion(window, { focus: true })
    expect(state.opacity).toBe(1)
    expect(events.focus).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('finishes a normal fade-in at full opacity', () => {
    const { window, events, state } = createWindow()
    state.visible = false
    showWindowWithMotion(window)
    vi.runAllTimers()
    expect(state.opacity).toBe(1)
    expect(events.show).toHaveBeenCalledOnce()
  })

  it('keeps background Electron tests hidden while resetting opacity', () => {
    backgroundE2e.mockReturnValue(true)
    const { window, events, state } = createWindow()
    state.visible = false
    showWindowWithMotion(window)
    expect(state.opacity).toBe(1)
    expect(events.show).not.toHaveBeenCalled()
  })

  it('ignores destroyed windows, including a window destroyed during a fade', () => {
    const { window, events, state } = createWindow()
    installWindowDragOpacity(window)
    state.visible = false
    showWindowWithMotion(window)
    state.destroyed = true
    events.setOpacity.mockClear()
    events.emit('will-move')
    showWindowWithMotion(window)
    hideWindowWithMotion(window)
    vi.runAllTimers()
    expect(events.setOpacity).not.toHaveBeenCalled()
  })

  it('handles a hidden window and native opacity failure without blocking hiding', () => {
    const { window, events, state } = createWindow()
    const hidden = vi.fn()
    state.visible = false
    hideWindowWithMotion(window, hidden)
    expect(hidden).toHaveBeenCalledOnce()
    state.visible = true
    events.setOpacity.mockImplementation(() => {
      throw new Error('Native failure')
    })
    hideWindowWithMotion(window, hidden)
    expect(events.hide).toHaveBeenCalledOnce()
    state.visible = false
    showWindowWithMotion(window)
    expect(events.show).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('finishes safely if native opacity fails partway through an animation', () => {
    const { window, events } = createWindow()
    const hidden = vi.fn()
    hideWindowWithMotion(window, hidden)
    events.setOpacity.mockImplementation(() => {
      throw new Error('Native failure')
    })
    vi.runAllTimers()
    expect(events.hide).toHaveBeenCalledOnce()
    expect(hidden).toHaveBeenCalledOnce()
  })
})
