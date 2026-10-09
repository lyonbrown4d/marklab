import { renderHook } from '@testing-library/react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useWorkspaceMapKeyboard } from '@/pages/workspace-map/useWorkspaceMapKeyboard'

const keyboardEvent = ({
  ctrlKey = false,
  defaultPrevented = false,
  isComposing = false,
  key = 'Escape',
  metaKey = false,
  shiftKey = false,
}: {
  ctrlKey?: boolean
  defaultPrevented?: boolean
  isComposing?: boolean
  key?: string
  metaKey?: boolean
  shiftKey?: boolean
}) => {
  const target = document.createElement('div')
  target.className = 'react-flow__node'
  target.dataset.id = 'file:notes/a.md'
  return {
    ctrlKey,
    defaultPrevented,
    key,
    metaKey,
    nativeEvent: { isComposing, key },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    shiftKey,
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
        exitFocusedView: vi.fn(() => false),
        flow: null,
        focusNode: vi.fn(),
        mode: 'overview',
        nodes: [],
        onCloseEditor,
        onModeChange: vi.fn(),
        onOpenSearch: vi.fn(),
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
        exitFocusedView: vi.fn(() => false),
        flow: null,
        focusNode: vi.fn(),
        mode: 'overview',
        nodes: [node],
        onCloseEditor,
        onModeChange: vi.fn(),
        onOpenSearch: vi.fn(),
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

  it('unwinds focus and map mode through layered Escape handling', () => {
    const exitFocusedView = vi.fn(() => true)
    const onModeChange = vi.fn()
    const { result, rerender } = renderHook(
      ({ mode }) =>
        useWorkspaceMapKeyboard({
          activePath: null,
          activateNode: vi.fn(),
          exitFocusedView,
          flow: null,
          focusNode: vi.fn(),
          mode,
          nodes: [],
          onCloseEditor: vi.fn(),
          onModeChange,
          onOpenSearch: vi.fn(),
        }),
      { initialProps: { mode: 'focus' as 'focus' | 'overview' } },
    )
    const firstEscape = keyboardEvent({ key: 'Escape' })

    result.current(firstEscape)

    expect(exitFocusedView).toHaveBeenCalledOnce()
    expect(onModeChange).not.toHaveBeenCalled()
    expect(firstEscape.preventDefault).toHaveBeenCalledOnce()

    exitFocusedView.mockReturnValue(false)
    rerender({ mode: 'focus' })
    const secondEscape = keyboardEvent({ key: 'Escape' })
    result.current(secondEscape)

    expect(onModeChange).toHaveBeenCalledExactlyOnceWith('overview')
    expect(secondEscape.preventDefault).toHaveBeenCalledOnce()
  })

  it('focuses the keyboard-targeted node with F', () => {
    const focusNode = vi.fn()
    const node = {
      data: { label: 'A', path: 'notes/a.md' },
      id: 'file:notes/a.md',
      position: { x: 0, y: 0 },
      type: 'file',
    }
    const { result } = renderHook(() =>
      useWorkspaceMapKeyboard({
        activePath: null,
        activateNode: vi.fn(),
        exitFocusedView: vi.fn(() => false),
        flow: null,
        focusNode,
        mode: 'overview',
        nodes: [node],
        onCloseEditor: vi.fn(),
        onModeChange: vi.fn(),
        onOpenSearch: vi.fn(),
      }),
    )
    const event = keyboardEvent({ key: 'f' })

    result.current(event)

    expect(focusNode).toHaveBeenCalledExactlyOnceWith(node)
    expect(event.preventDefault).toHaveBeenCalledOnce()
  })

  it.each([
    ['Control', { ctrlKey: true }],
    ['Meta', { metaKey: true }],
  ])('opens node search with %s+F and leaves modified workspace search alone', (_name, mod) => {
    const onOpenSearch = vi.fn()
    const options = {
      activePath: null,
      activateNode: vi.fn(),
      exitFocusedView: vi.fn(() => false),
      flow: null,
      focusNode: vi.fn(),
      mode: 'overview' as const,
      nodes: [],
      onCloseEditor: vi.fn(),
      onModeChange: vi.fn(),
      onOpenSearch,
    }
    const { result } = renderHook(() => useWorkspaceMapKeyboard(options))
    const find = keyboardEvent({ ...mod, key: 'f' })
    const workspaceFind = keyboardEvent({ ...mod, key: 'f', shiftKey: true })

    result.current(find)
    result.current(workspaceFind)

    expect(onOpenSearch).toHaveBeenCalledOnce()
    expect(find.preventDefault).toHaveBeenCalledOnce()
    expect(find.stopPropagation).toHaveBeenCalledOnce()
    expect(workspaceFind.preventDefault).not.toHaveBeenCalled()
    expect(workspaceFind.stopPropagation).not.toHaveBeenCalled()
  })
})
