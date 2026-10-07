import { EventEmitter } from 'node:events'

import type { BrowserWindow, HandlerDetails } from 'electron'
import { describe, expect, it, vi } from 'vitest'

import { installWindowNavigationGuard } from '@electron/windowNavigation'

const openExternal = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('electron', () => ({
  shell: { openExternal },
}))

type OpenDetails = Pick<HandlerDetails, 'postBody' | 'url'>
type OpenHandler = (details: OpenDetails) => { action: 'allow' | 'deny' }

const createWindow = () => {
  let openHandler: OpenHandler | null = null
  const webContents = Object.assign(new EventEmitter(), {
    setWindowOpenHandler: vi.fn((handler: OpenHandler) => {
      openHandler = handler
    }),
  })
  return {
    getOpenHandler: () => openHandler,
    window: { webContents } as unknown as BrowserWindow,
  }
}

describe('installWindowNavigationGuard', () => {
  it('denies every child window and opens only GET HTTP(S) targets externally', async () => {
    const harness = createWindow()
    installWindowNavigationGuard(harness.window, ['file:///app/index.html'])
    const handler = harness.getOpenHandler()

    expect(handler?.({ url: 'https://example.com/guide' })).toEqual({
      action: 'deny',
    })
    expect(
      handler?.({
        postBody: { contentType: 'application/x-www-form-urlencoded', data: [] },
        url: 'https://example.com/upload',
      }),
    ).toEqual({ action: 'deny' })
    expect(handler?.({ url: 'javascript:alert(1)' })).toEqual({
      action: 'deny',
    })
    await Promise.resolve()

    expect(openExternal).toHaveBeenCalledExactlyOnceWith('https://example.com/guide')
  })

  it('allows only exact app-shell navigation and blocks everything else in place', () => {
    const harness = createWindow()
    installWindowNavigationGuard(harness.window, [
      'file:///app/index.html',
      'file:///app/window-opening.html',
    ])
    const allowed = { preventDefault: vi.fn() }
    const queryVariant = { preventDefault: vi.fn() }
    const external = { preventDefault: vi.fn() }

    harness.window.webContents.emit('will-navigate', {
      ...allowed,
      url: 'file:///app/index.html',
    })
    harness.window.webContents.emit('will-navigate', {
      ...queryVariant,
      url: 'file:///app/index.html?next=1',
    })
    harness.window.webContents.emit('will-navigate', {
      ...external,
      url: 'https://example.com',
    })

    expect(allowed.preventDefault).not.toHaveBeenCalled()
    expect(queryVariant.preventDefault).toHaveBeenCalledOnce()
    expect(external.preventDefault).toHaveBeenCalledOnce()
    expect(openExternal).not.toHaveBeenCalled()
  })
})
