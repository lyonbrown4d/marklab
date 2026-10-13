import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dismissSplashWindow, showSplashWithoutActivation } from '@electron/splashLifecycle'

vi.mock('@electron/windowMotion', () => ({
  hideWindowWithMotion: vi.fn(),
  showWindowWithMotion: vi.fn(),
  notifyWindowPresented: vi.fn(),
}))

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

  it('notifies the caller only after the splash renderer is destroyed', () => {
    const splash = createSplash()
    const events: string[] = []
    let finishHide: (() => void) | undefined
    const hide = vi.fn((_window, onHidden: () => void) => {
      finishHide = onHidden
    })

    dismissSplashWindow(splash as unknown as BrowserWindow, hide, () => {
      events.push('present-main')
    })

    expect(events).toEqual([])
    finishHide?.()

    expect(splash.destroy).toHaveBeenCalledOnce()
    expect(events).toEqual(['present-main'])
  })

  it('destroys a lingering splash when the hide callback never arrives', () => {
    vi.useFakeTimers()
    const splash = createSplash()

    dismissSplashWindow(splash as unknown as BrowserWindow, vi.fn())
    vi.runAllTimers()

    expect(splash.destroy).toHaveBeenCalledOnce()
    expect(splash.listenerCount('closed')).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('waits for the actual closed event after asynchronous native destruction', () => {
    vi.useFakeTimers()
    const splash = createSplash()
    const dismissed = vi.fn()
    splash.destroy.mockImplementation(() => {})
    dismissSplashWindow(
      splash as unknown as BrowserWindow,
      (_window, onHidden) => onHidden(),
      dismissed,
    )
    expect(splash.destroy).toHaveBeenCalledOnce()
    expect(dismissed).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    splash.emit('closed')
    expect(dismissed).toHaveBeenCalledOnce()
    expect(splash.listenerCount('closed')).toBe(0)
  })

  it('cleans up a failed native destroy without reporting a completed dismissal', () => {
    vi.useFakeTimers()
    const splash = createSplash()
    const dismissed = vi.fn()
    splash.destroy.mockImplementation(() => {
      throw new Error('Native destroy failed')
    })
    expect(() =>
      dismissSplashWindow(
        splash as unknown as BrowserWindow,
        (_window, onHidden) => onHidden(),
        dismissed,
      ),
    ).not.toThrow()
    expect(dismissed).not.toHaveBeenCalled()
    expect(splash.listenerCount('closed')).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('still waits for closed if external native destruction occurs during the hide callback', () => {
    vi.useFakeTimers()
    const splash = createSplash()
    const dismissed = vi.fn()
    dismissSplashWindow(
      splash as unknown as BrowserWindow,
      (_window, onHidden) => {
        vi.spyOn(splash, 'isDestroyed').mockReturnValue(true)
        onHidden()
      },
      dismissed,
    )
    expect(dismissed).not.toHaveBeenCalled()
    expect(splash.destroy).not.toHaveBeenCalled()
    splash.emit('closed')
    expect(dismissed).toHaveBeenCalledOnce()
    expect(splash.listenerCount('closed')).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('completes once and clears the fallback when the splash closes during its exit', () => {
    vi.useFakeTimers()
    const splash = createSplash()
    let finishHide: (() => void) | undefined
    const dismissed = vi.fn()
    dismissSplashWindow(
      splash as unknown as BrowserWindow,
      (_window, onHidden) => {
        finishHide = onHidden
      },
      dismissed,
    )
    splash.close()
    finishHide?.()
    expect(dismissed).toHaveBeenCalledOnce()
    expect(splash.destroy).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    expect(splash.listenerCount('closed')).toBe(0)
  })

  it('completes immediately when native hiding throws or the splash is already destroyed', () => {
    vi.useFakeTimers()
    const splash = createSplash()
    const dismissed = vi.fn()
    dismissSplashWindow(
      splash as unknown as BrowserWindow,
      () => {
        throw new Error('Native window unavailable')
      },
      dismissed,
    )
    const hide = vi.fn()
    dismissSplashWindow(splash as unknown as BrowserWindow, hide, dismissed)
    expect(splash.destroy).toHaveBeenCalledOnce()
    expect(dismissed).toHaveBeenCalledTimes(2)
    expect(hide).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
