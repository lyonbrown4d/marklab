import { describe, expect, it } from 'vitest'

import {
  webTabActivateRequestSchema,
  webTabEventSchema,
  webTabIdRequestSchema,
  webTabShortcutBindingsRequestSchema,
} from '@/types/webTabs'

describe('web tab contracts', () => {
  it('accepts a bounded activate request', () => {
    expect(
      webTabActivateRequestSchema.parse({
        bounds: { height: 480, width: 800, x: 12, y: 20 },
        tabId: 'tab.docs',
        url: 'https://example.com/docs',
      }),
    ).toEqual({
      bounds: { height: 480, width: 800, x: 12, y: 20 },
      tabId: 'tab.docs',
      url: 'https://example.com/docs',
    })
  })

  it('rejects fractional bounds and unsafe tab identifiers', () => {
    expect(() =>
      webTabActivateRequestSchema.parse({
        bounds: { height: 480, width: 800.5, x: 0, y: 0 },
        tabId: '../tab',
        url: 'https://example.com',
      }),
    ).toThrow()
    expect(() => webTabIdRequestSchema.parse({ tabId: '' })).toThrow()
  })

  it('validates state and blocked-window events', () => {
    expect(
      webTabEventSchema.parse({
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
      }),
    ).toMatchObject({ type: 'state' })
    expect(
      webTabEventSchema.parse({
        tabId: 'docs',
        type: 'open-requested',
        url: 'https://popup.example.com/',
      }),
    ).toMatchObject({ type: 'open-requested' })

    expect(() =>
      webTabEventSchema.parse({
        state: {
          active: true,
          canGoBack: false,
          canGoForward: false,
          status: 'ready',
          tabId: 'docs',
          title: 't'.repeat(513),
          url: 'https://example.com/',
        },
        type: 'state',
      }),
    ).toThrow()
  })

  it('accepts only app-scope shortcut bindings', () => {
    expect(
      webTabShortcutBindingsRequestSchema.parse({
        bindings: {
          'app.commandPalette': ['Mod+Shift+P'],
          'tab.close': ['Mod+W'],
        },
      }),
    ).toEqual({
      bindings: {
        'app.commandPalette': ['Mod+Shift+P'],
        'tab.close': ['Mod+W'],
      },
    })
    expect(() =>
      webTabShortcutBindingsRequestSchema.parse({
        bindings: { 'editor.bold': ['Mod+B'] },
      }),
    ).toThrow()
  })
})
