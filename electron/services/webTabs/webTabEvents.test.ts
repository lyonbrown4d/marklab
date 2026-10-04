import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { installWebTabEvents } from '@electron/services/webTabs/webTabEvents.js'

afterEach(() => vi.useRealTimers())

describe('installWebTabEvents', () => {
  it('bounds, deduplicates, and coalesces remote title updates', () => {
    vi.useFakeTimers()
    const contents = Object.assign(new EventEmitter(), {
      isDestroyed: vi.fn(() => false),
      setWindowOpenHandler: vi.fn(),
    })
    const onTitle = vi.fn()
    installWebTabEvents(contents as never, callbacks({ onTitle }))

    contents.emit('page-title-updated', {}, 'first')
    contents.emit('page-title-updated', {}, 'x'.repeat(700))
    expect(onTitle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(250)
    expect(onTitle).toHaveBeenCalledExactlyOnceWith('x'.repeat(512))

    contents.emit('page-title-updated', {}, 'x'.repeat(700))
    vi.advanceTimersByTime(250)
    expect(onTitle).toHaveBeenCalledTimes(1)
  })

  it('deduplicates and coalesces in-page URL updates', () => {
    vi.useFakeTimers()
    const contents = Object.assign(new EventEmitter(), {
      isDestroyed: vi.fn(() => false),
      setWindowOpenHandler: vi.fn(),
    })
    const onNavigated = vi.fn()
    installWebTabEvents(contents as never, callbacks({ onNavigated }))

    contents.emit('did-navigate-in-page', {}, 'https://example.com/#one')
    contents.emit('did-navigate-in-page', {}, 'https://example.com/#two')
    expect(onNavigated).not.toHaveBeenCalled()
    vi.advanceTimersByTime(250)
    expect(onNavigated).toHaveBeenCalledExactlyOnceWith('https://example.com/#two')

    contents.emit('did-navigate-in-page', {}, `https://example.com/${'x'.repeat(4096)}`)
    vi.advanceTimersByTime(250)
    expect(onNavigated).toHaveBeenCalledTimes(1)
  })

  it('does not let a remote beforeunload handler trap the app', () => {
    const contents = Object.assign(new EventEmitter(), {
      isDestroyed: vi.fn(() => false),
      setWindowOpenHandler: vi.fn(),
    })
    const cleanup = installWebTabEvents(contents as never, callbacks({}))
    const event = { preventDefault: vi.fn() }

    contents.emit('will-prevent-unload', event)
    expect(event.preventDefault).toHaveBeenCalledOnce()

    cleanup()
    expect(contents.listenerCount('will-prevent-unload')).toBe(0)
  })

  it('removes every installed listener when a pooled view is released', () => {
    const contents = Object.assign(new EventEmitter(), {
      isDestroyed: vi.fn(() => false),
      setWindowOpenHandler: vi.fn(),
    })
    const cleanup = installWebTabEvents(contents as never, callbacks({}))

    cleanup()

    expect(contents.eventNames()).toEqual([])
    expect(contents.setWindowOpenHandler).toHaveBeenLastCalledWith(expect.any(Function))
    expect(contents.setWindowOpenHandler).toHaveBeenCalledTimes(2)
    expect(
      contents.setWindowOpenHandler.mock.calls[1]?.[0]({ url: 'https://example.com' }),
    ).toEqual({
      action: 'deny',
    })
  })
})

const callbacks = (overrides: Record<string, unknown>) => ({
  onCrashed: vi.fn(),
  onFailed: vi.fn(),
  onInput: vi.fn(),
  onLoading: vi.fn(),
  onNavigated: vi.fn(),
  onReady: vi.fn(),
  onTitle: vi.fn(),
  onWindowOpen: vi.fn(),
  ...overrides,
})
