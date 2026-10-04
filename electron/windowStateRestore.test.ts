import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { restoreMaximizedOnFirstShow } from '@electron/windowStateRestore.js'

describe('restoreMaximizedOnFirstShow', () => {
  it('keeps prewarmed windows hidden until their first explicit show', () => {
    const window = Object.assign(new EventEmitter(), {
      isDestroyed: () => false,
      maximize: vi.fn(),
    })

    restoreMaximizedOnFirstShow(window as unknown as BrowserWindow, true)

    expect(window.maximize).not.toHaveBeenCalled()
    window.emit('show')
    window.emit('show')
    expect(window.maximize).toHaveBeenCalledOnce()
  })

  it('does not register restoration when the previous window was not maximized', () => {
    const window = Object.assign(new EventEmitter(), {
      isDestroyed: () => false,
      maximize: vi.fn(),
    })

    restoreMaximizedOnFirstShow(window as unknown as BrowserWindow, false)
    window.emit('show')

    expect(window.maximize).not.toHaveBeenCalled()
  })
})
