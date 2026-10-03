import { renderHook } from '@testing-library/react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useWorkspaceMapKeyboard } from '@/pages/workspace-map/useWorkspaceMapKeyboard'

const keyboardEvent = ({
  defaultPrevented = false,
  isComposing = false,
  keyCode = 0,
}: {
  defaultPrevented?: boolean
  isComposing?: boolean
  keyCode?: number
}) =>
  ({
    defaultPrevented,
    key: 'Escape',
    nativeEvent: { isComposing, keyCode },
    preventDefault: vi.fn(),
    target: document.createElement('div'),
  }) as unknown as ReactKeyboardEvent<HTMLDivElement>

describe('useWorkspaceMapKeyboard', () => {
  it('leaves prevented and IME Escape events to the active interaction', () => {
    const onCloseEditor = vi.fn()
    const { result } = renderHook(() =>
      useWorkspaceMapKeyboard({
        activePath: 'notes/a.md',
        activateNode: vi.fn(),
        flow: null,
        nodes: [],
        onCloseEditor,
      }),
    )

    result.current(keyboardEvent({ defaultPrevented: true }))
    result.current(keyboardEvent({ isComposing: true }))
    result.current(keyboardEvent({ keyCode: 229 }))

    expect(onCloseEditor).not.toHaveBeenCalled()
  })
})
