import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useVimEditorCommands } from '@/app/useVimEditorCommands'
import { APP_EVENT, emitAppEvent } from '@/utils/appEvents'

const close = () =>
  emitAppEvent(APP_EVENT.closeVimSource, { path: 'note.md', workspaceKey: 'external:/one' })

describe('Vim source close bridge', () => {
  it('closes only the matching active source tab and unregisters on unmount', () => {
    const initial = {
      activePath: 'note.md',
      workspaceKey: 'external:/one',
      viewMode: 'source',
      onCloseActiveTab: vi.fn(),
    }
    const { rerender, unmount } = renderHook((state) => useVimEditorCommands(state), {
      initialProps: initial,
    })
    act(close)
    expect(initial.onCloseActiveTab).toHaveBeenCalledOnce()
    rerender({ ...initial, activePath: 'other.md' })
    act(close)
    rerender({ ...initial, workspaceKey: 'external:/two' })
    act(close)
    rerender({ ...initial, viewMode: 'wysiwyg' })
    act(close)
    unmount()
    act(close)
    expect(initial.onCloseActiveTab).toHaveBeenCalledOnce()
  })
})
