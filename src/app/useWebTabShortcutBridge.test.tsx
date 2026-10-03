import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultShortcutBindings } from '@/logic/shortcuts'
import type { WebTabEvent } from '@/types/webTabs'

const runtime = vi.hoisted(() => ({
  handler: undefined as ((event: WebTabEvent) => void) | undefined,
  setShortcutBindings: vi.fn(async () => ({ ok: true as const })),
  unsubscribe: vi.fn(),
}))

vi.mock('@/runtime/electron', () => ({
  getElectronRuntime: () => ({
    webTabs: {
      onState: (handler: (event: WebTabEvent) => void) => {
        runtime.handler = handler
        return runtime.unsubscribe
      },
      setShortcutBindings: runtime.setShortcutBindings,
    },
  }),
  isElectronRuntime: () => true,
}))

import { useWebTabShortcutBridge } from '@/app/useWebTabShortcutBridge'

describe('useWebTabShortcutBridge', () => {
  beforeEach(() => {
    runtime.handler = undefined
    runtime.setShortcutBindings.mockClear()
    runtime.unsubscribe.mockClear()
  })

  it('syncs resolved app bindings and dispatches only the active native tab shortcut', () => {
    const execute = vi.fn()
    const { unmount } = renderHook(() =>
      useWebTabShortcutBridge({
        activeTabId: 'web:docs',
        bindings: defaultShortcutBindings,
        execute,
      }),
    )

    expect(runtime.setShortcutBindings).toHaveBeenCalledWith({
      bindings: expect.objectContaining({
        'app.commandPalette': ['Mod+P'],
        'tab.close': ['Mod+W'],
        'view.toggleTerminal': ['Mod+J'],
      }),
    })

    act(() => {
      runtime.handler?.({
        action: 'view.toggleTerminal',
        tabId: 'other',
        type: 'shortcut',
      })
      runtime.handler?.({
        action: 'view.toggleTerminal',
        tabId: 'docs',
        type: 'shortcut',
      })
    })

    expect(execute).toHaveBeenCalledExactlyOnceWith('view.toggleTerminal')
    unmount()
    expect(runtime.unsubscribe).toHaveBeenCalledOnce()
  })

  it('ignores non-shortcut events', () => {
    const execute = vi.fn()
    renderHook(() =>
      useWebTabShortcutBridge({
        activeTabId: 'web:docs',
        bindings: defaultShortcutBindings,
        execute,
      }),
    )

    act(() => {
      runtime.handler?.({
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
      })
    })

    expect(execute).not.toHaveBeenCalled()
  })
})
