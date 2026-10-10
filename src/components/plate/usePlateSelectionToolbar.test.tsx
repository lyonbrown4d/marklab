import { act, renderHook, waitFor } from '@testing-library/react'
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
  Reflect.deleteProperty(document.documentElement, 'clientHeight')
  Reflect.deleteProperty(document.documentElement, 'clientWidth')
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
  it('uses Plate floating to reposition on editor scroll and viewport resize', async () => {
    const editor = createEditor()
    const scroller = document.createElement('div')
    scroller.style.overflow = 'auto'
    const root = document.createElement('div')
    root.contentEditable = 'true'
    root.tabIndex = 0
    root.textContent = 'text selection'
    scroller.append(root)
    document.body.append(scroller)
    const rect = installNativeSelection(root)
    const editableRef = createRef<HTMLElement>()
    editableRef.current = root
    Object.defineProperties(document.documentElement, {
      clientHeight: { configurable: true, value: 768 },
      clientWidth: { configurable: true, value: 1024 },
    })

    const { result } = renderHook(() =>
      usePlateSelectionToolbar({ editableRef, editor, readOnly: false }),
    )

    act(() => document.dispatchEvent(new Event('selectionchange')))
    expect(result.current.open).toBe(true)
    const toolbar = document.createElement('div')
    toolbar.style.height = '20px'
    toolbar.style.width = '40px'
    Object.defineProperties(toolbar, {
      offsetHeight: { configurable: true, value: 20 },
      offsetWidth: { configurable: true, value: 40 },
    })
    document.body.append(toolbar)
    act(() => result.current.setToolbarElement(toolbar))
    await waitFor(() =>
      expect(result.current.floatingStyle).toMatchObject({
        left: 92,
        position: 'fixed',
        top: 16,
      }),
    )

    rect.left = 120
    rect.right = 184
    act(() => scroller.dispatchEvent(new Event('scroll')))
    await waitFor(() => expect(result.current.floatingStyle?.left).toBe(132))

    rect.bottom = 104
    rect.top = 84
    act(() => window.dispatchEvent(new Event('resize')))
    await waitFor(() => expect(result.current.floatingStyle?.top).toBe(56))

    rect.bottom = 24
    rect.height = 20
    rect.left = 0
    rect.right = 4
    rect.top = 4
    rect.width = 4
    act(() => window.dispatchEvent(new Event('resize')))
    await waitFor(() => expect(result.current.floatingStyle).toMatchObject({ left: 8, top: 32 }))
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

  it('stays open inside the toolbar and hides after focus leaves both surfaces', async () => {
    const editor = createEditor()
    const root = document.createElement('div')
    const toolbar = document.createElement('div')
    const toolbarButton = document.createElement('button')
    const outside = document.createElement('button')
    root.tabIndex = 0
    root.textContent = 'text selection'
    toolbar.append(toolbarButton)
    document.body.append(root, toolbar, outside)
    installNativeSelection(root)
    const editableRef = createRef<HTMLElement>()
    editableRef.current = root
    const { result } = renderHook(() =>
      usePlateSelectionToolbar({ editableRef, editor, readOnly: false }),
    )
    act(() => document.dispatchEvent(new Event('selectionchange')))
    expect(result.current.open).toBe(true)
    act(() => result.current.setToolbarElement(toolbar))

    await act(async () => {
      toolbarButton.focus()
      expect(document.activeElement).toBe(toolbarButton)
      expect(window.getSelection()?.rangeCount).toBe(1)
      expect(root.contains(window.getSelection()?.anchorNode ?? null)).toBe(false)
      await new Promise((resolve) => window.setTimeout(resolve, 24))
    })
    expect(result.current.open).toBe(true)

    await act(async () => {
      outside.focus()
      await new Promise((resolve) => window.setTimeout(resolve, 24))
    })

    expect(result.current.open).toBe(false)
  })

  it('rejects toolbar actions when editing is unavailable', () => {
    const editor = createEditor()
    const root = document.createElement('div')
    const editableRef = createRef<HTMLElement>()
    editableRef.current = root
    document.body.append(root)
    const { result } = renderHook(() =>
      usePlateSelectionToolbar({ canEdit: () => false, editableRef, editor, readOnly: false }),
    )

    expect(result.current.runAction('bold')).toBe(false)
    expect(editor.tf.toggleMark).not.toHaveBeenCalled()
  })

  it('runs an enabled action and reports an invalid editor selection as unhandled', async () => {
    const editor = createEditor()
    const root = document.createElement('div')
    const editableRef = createRef<HTMLElement>()
    editableRef.current = root
    document.body.append(root)
    const { result } = renderHook(() =>
      usePlateSelectionToolbar({ editableRef, editor, readOnly: false }),
    )

    expect(result.current.runAction('bold')).toBe(true)
    expect(editor.tf.toggleMark).toHaveBeenCalledWith('bold')
    await act(async () => Promise.resolve())

    editor.selection = null
    expect(result.current.runAction('bold')).toBe(false)
  })

  it('synchronizes immediately when animation frames are unavailable', () => {
    const editor = createEditor()
    const root = document.createElement('div')
    root.tabIndex = 0
    root.textContent = 'text selection'
    document.body.append(root)
    installNativeSelection(root)
    const editableRef = createRef<HTMLElement>()
    editableRef.current = root
    const originalAnimationFrame = window.requestAnimationFrame
    Reflect.deleteProperty(window, 'requestAnimationFrame')

    try {
      const { result } = renderHook(() =>
        usePlateSelectionToolbar({ editableRef, editor, readOnly: false }),
      )
      act(() => document.dispatchEvent(new Event('selectionchange')))
      expect(result.current.open).toBe(true)
      act(() => root.dispatchEvent(new Event('scroll')))
    } finally {
      window.requestAnimationFrame = originalAnimationFrame
    }
  })
})
