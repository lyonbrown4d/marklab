import { act, renderHook } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PlateEditor } from 'platejs/react'
import { usePlateSelectionToolbar } from '@/components/plate/usePlateSelectionToolbar'

const expandedSelection = {
  anchor: { offset: 0, path: [0, 0] },
  focus: { offset: 4, path: [0, 0] },
}

afterEach(() => {
  window.getSelection()?.removeAllRanges()
  document.body.innerHTML = ''
})

const createEditor = () =>
  ({
    api: {
      isExpanded: vi.fn(() => true),
      marks: vi.fn(() => ({ bold: true })),
      some: vi.fn(() => false),
    },
    selection: expandedSelection,
    tf: {
      focus: vi.fn(),
      removeMarks: vi.fn(),
      setNodes: vi.fn(),
      toggleMark: vi.fn(),
      unwrapNodes: vi.fn(),
    },
  }) as unknown as PlateEditor

const installNativeSelection = (root: HTMLElement) => {
  const text = root.firstChild!
  const range = document.createRange()
  const rect = { bottom: 64, height: 20, left: 80, right: 144, top: 44, width: 64 }
  range.setStart(text, 0)
  range.setEnd(text, 4)
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => rect,
  })
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
  root.focus()
  return rect
}

describe('usePlateSelectionToolbar', () => {
  it('shows an expanded editor selection and updates its anchor after scrolling', async () => {
    const editor = createEditor()
    const root = document.createElement('div')
    root.contentEditable = 'true'
    root.tabIndex = 0
    root.textContent = 'text selection'
    document.body.append(root)
    const rect = installNativeSelection(root)
    const editableRef = createRef<HTMLElement>()
    editableRef.current = root

    const { result } = renderHook(() =>
      usePlateSelectionToolbar({ editableRef, editor, readOnly: false }),
    )

    act(() => document.dispatchEvent(new Event('selectionchange')))
    expect(result.current.open).toBe(true)
    expect(result.current.anchor).toEqual({ left: 112, top: 44 })

    rect.left = 120
    rect.right = 184
    await act(async () => {
      document.dispatchEvent(new Event('scroll', { bubbles: true }))
      await new Promise((resolve) => window.setTimeout(resolve, 24))
    })
    expect(result.current.anchor).toEqual({ left: 152, top: 44 })
  })

  it.each([
    ['read-only', true, true],
    ['collapsed', false, false],
  ] as const)('hides for a %s editor state', (_name, readOnly, expanded) => {
    const editor = createEditor()
    vi.mocked(editor.api.isExpanded).mockReturnValue(expanded)
    const root = document.createElement('div')
    root.tabIndex = 0
    root.textContent = 'text selection'
    document.body.append(root)
    installNativeSelection(root)
    const editableRef = createRef<HTMLElement>()
    editableRef.current = root

    const { result } = renderHook(() => usePlateSelectionToolbar({ editableRef, editor, readOnly }))

    act(() => document.dispatchEvent(new Event('selectionchange')))
    expect(result.current.open).toBe(false)
  })

  it('hides during IME composition and restores after composition ends', () => {
    const editor = createEditor()
    const root = document.createElement('div')
    root.tabIndex = 0
    root.textContent = 'text selection'
    document.body.append(root)
    installNativeSelection(root)
    const editableRef = createRef<HTMLElement>()
    editableRef.current = root
    const { result } = renderHook(() =>
      usePlateSelectionToolbar({ editableRef, editor, readOnly: false }),
    )

    act(() => document.dispatchEvent(new Event('selectionchange')))
    expect(result.current.open).toBe(true)

    act(() => root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })))
    expect(result.current.open).toBe(false)

    act(() => root.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })))
    expect(result.current.open).toBe(true)
  })

  it('hides after focus leaves both the editor and the toolbar', async () => {
    const editor = createEditor()
    const root = document.createElement('div')
    const outside = document.createElement('button')
    root.tabIndex = 0
    root.textContent = 'text selection'
    document.body.append(root, outside)
    installNativeSelection(root)
    const editableRef = createRef<HTMLElement>()
    editableRef.current = root
    const { result } = renderHook(() =>
      usePlateSelectionToolbar({ editableRef, editor, readOnly: false }),
    )
    act(() => document.dispatchEvent(new Event('selectionchange')))
    expect(result.current.open).toBe(true)

    await act(async () => {
      outside.focus()
      await new Promise((resolve) => window.setTimeout(resolve, 24))
    })

    expect(result.current.open).toBe(false)
  })
})
