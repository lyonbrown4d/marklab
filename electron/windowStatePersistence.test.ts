import { EventEmitter } from 'node:events'

import type { BrowserWindow } from 'electron'
import { describe, expect, it, vi } from 'vitest'

import {
  finalizePersistedWindowState,
  flushPersistedWindowState,
  installWindowStatePersistence,
  releasePersistedWindowState,
} from '@electron/windowStatePersistence'

describe('window state persistence', () => {
  it('writes once on finalization and ignores later close events', () => {
    vi.useFakeTimers()
    const window = Object.assign(new EventEmitter(), {
      isDestroyed: () => false,
    }) as unknown as BrowserWindow
    const writeState = vi.fn()
    installWindowStatePersistence(window, writeState, 100)

    window.emit('resize')
    finalizePersistedWindowState(window)
    window.emit('close')
    vi.runAllTimers()

    expect(writeState).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })

  it('can flush without disabling later persistence events', () => {
    vi.useFakeTimers()
    const window = Object.assign(new EventEmitter(), {
      isDestroyed: () => false,
    }) as unknown as BrowserWindow
    const writeState = vi.fn()
    installWindowStatePersistence(window, writeState, 100)

    flushPersistedWindowState(window)
    window.emit('resize')
    vi.runAllTimers()

    expect(writeState).toHaveBeenCalledTimes(2)
    releasePersistedWindowState(window)
    window.emit('resize')
    vi.runAllTimers()
    expect(writeState).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})
