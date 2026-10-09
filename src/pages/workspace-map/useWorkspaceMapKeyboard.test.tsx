import { renderHook } from '@testing-library/react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useWorkspaceMapKeyboard } from '@/pages/workspace-map/useWorkspaceMapKeyboard'

const keyboardEvent = ({
  defaultPrevented = false,
  isComposing = false,
  key = 'Escape',
}: {
  defaultPrevented?: boolean
  isComposing?: boolean
  key?: string
}) => {
  const target = document.createElement('div')
  target.className = 'react-flow__node'
  target.dataset.id = 'file:notes/a.md'
  return {
    defaultPrevented,
    key,
    nativeEvent: { isComposing, key },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    target,
  } as unknown as ReactKeyboardEvent<HTMLDivElement>
}

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
    result.current(keyboardEvent({ key: 'Process' }))

    expect(onCloseEditor).not.toHaveBeenCalled()
  })

  it('handles Enter activation and Escape dismissal without leaking either command', () => {
    const activateNode = vi.fn()
    const onCloseEditor = vi.fn()
    const node = {
      data: { label: 'A', path: 'notes/a.md' },
      id: 'file:notes/a.md',
      position: { x: 0, y: 0 },
      type: 'file',
    }
    const { result } = renderHook(() =>
      useWorkspaceMapKeyboard({
        activePath: 'notes/active.md',
        activateNode,
        flow: null,
        nodes: [node],
        onCloseEditor,
      }),
    )
    const enter = keyboardEvent({ key: 'Enter' })
    const escape = keyboardEvent({ key: 'Escape' })

    result.current(enter)
    result.current(escape)

    expect(activateNode).toHaveBeenCalledExactlyOnceWith(node)
    expect(onCloseEditor).toHaveBeenCalledOnce()
    expect(enter.preventDefault).toHaveBeenCalledOnce()
    expect(enter.stopPropagation).toHaveBeenCalledOnce()
    expect(escape.preventDefault).toHaveBeenCalledOnce()
    expect(escape.stopPropagation).toHaveBeenCalledOnce()
  })
})
