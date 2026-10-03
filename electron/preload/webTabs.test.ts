import { describe, expect, it, vi } from 'vitest'

import { nativeIpcChannels } from '@electron/channels.js'
import { createWebTabsPreloadSurface } from '@electron/preload/webTabs.js'

describe('web tabs preload surface', () => {
  it('uses named channels and validates command results', async () => {
    const invoke = vi.fn(async () => ({ ok: true }))
    const surface = createWebTabsPreloadSurface({
      invoke,
      on: vi.fn(),
      removeListener: vi.fn(),
    } as never)
    const request = {
      bounds: { height: 400, width: 600, x: 0, y: 30 },
      tabId: 'docs',
      url: 'https://example.com',
    }

    await expect(surface.activate(request)).resolves.toEqual({ ok: true })
    expect(invoke).toHaveBeenCalledWith(nativeIpcChannels.webTabsActivate, request)
  })

  it('rejects malformed backend responses', async () => {
    const surface = createWebTabsPreloadSurface({
      invoke: vi.fn(async () => ({ success: true })),
      on: vi.fn(),
      removeListener: vi.fn(),
    } as never)
    await expect(surface.hide({ tabId: 'docs' })).rejects.toThrow('Invalid webTabs.hide response')
  })

  it('sends resolved shortcut bindings through a named channel', async () => {
    const invoke = vi.fn(async () => ({ ok: true }))
    const surface = createWebTabsPreloadSurface({
      invoke,
      on: vi.fn(),
      removeListener: vi.fn(),
    } as never)
    const request = { bindings: { 'app.settings': ['Mod+Shift+,'] } }
    await surface.setShortcutBindings(request)
    expect(invoke).toHaveBeenCalledWith(nativeIpcChannels.webTabsSetShortcutBindings, request)
  })

  it('validates state events and removes the exact listener', () => {
    const listeners = new Map<string, (...args: unknown[]) => void>()
    const removeListener = vi.fn()
    const handler = vi.fn()
    const surface = createWebTabsPreloadSurface({
      invoke: vi.fn(),
      on: vi.fn((channel, listener) => listeners.set(channel, listener)),
      removeListener,
    } as never)
    const unsubscribe = surface.onState(handler)
    const listener = listeners.get(nativeIpcChannels.webTabsState)
    const event = {
      state: {
        active: true,
        canGoBack: false,
        canGoForward: false,
        status: 'ready',
        tabId: 'docs',
        title: 'Docs',
        url: 'https://example.com/',
      },
      type: 'state',
    }
    listener?.({}, event)
    listener?.({}, { type: 'unknown' })
    expect(handler).toHaveBeenCalledExactlyOnceWith(event)
    unsubscribe()
    expect(removeListener).toHaveBeenCalledWith(nativeIpcChannels.webTabsState, listener)
  })
})
