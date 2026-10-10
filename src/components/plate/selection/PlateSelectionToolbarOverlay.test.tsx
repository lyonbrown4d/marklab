import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRef, type RefObject } from 'react'
import type { PlateEditor } from 'platejs/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const plateContext = vi.hoisted(() => ({
  editor: {
    api: {
      isExpanded: vi.fn(() => true),
      marks: vi.fn(() => ({ bold: true })),
      some: vi.fn(() => false),
    },
    selection: {
      anchor: { offset: 0, path: [0, 0] },
      focus: { offset: 4, path: [0, 0] },
    },
    tf: {
      focus: vi.fn(),
      removeMarks: vi.fn(),
      setNodes: vi.fn(),
      toggleMark: vi.fn(),
      unwrapNodes: vi.fn(),
    },
  } as unknown as PlateEditor,
  readOnly: false,
}))

vi.mock('platejs/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('platejs/react')>()
  return {
    ...actual,
    useEditorComposing: () => false,
    useEditorReadOnly: () => plateContext.readOnly,
    useEditorRef: () => plateContext.editor,
    useEditorSelection: () => plateContext.editor.selection,
  }
})

import { PlateSelectionToolbarOverlay } from '@/components/plate/selection/PlateSelectionToolbarOverlay'

const labels = {
  bold: 'Bold',
  clear: 'Clear formatting',
  code: 'Inline code',
  italic: 'Italic',
  link: 'Link',
  strike: 'Strikethrough',
  toolbar: 'Text formatting',
}

const originalRangeRect = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect')
const originalVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport')

const installNativeSelection = (root: HTMLElement) => {
  const rect = { bottom: 64, height: 20, left: 80, right: 144, top: 44, width: 64 }
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => rect,
  })
  const range = document.createRange()
  range.setStart(root.firstChild!, 0)
  range.setEnd(root.firstChild!, 4)
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
  root.focus()
  return rect
}

const ToolbarHarness = ({ editableRef }: { editableRef: RefObject<HTMLDivElement | null> }) => (
  <div>
    <div data-testid="transformed-ancestor" style={{ transform: 'translateY(24px)' }}>
      <div data-testid="nested-scroller" style={{ overflow: 'auto' }}>
        <div contentEditable data-testid="editor" ref={editableRef} tabIndex={0}>
          text selection
        </div>
        <PlateSelectionToolbarOverlay
          canEdit={() => true}
          editableRef={editableRef}
          labels={labels}
        />
      </div>
    </div>
    <button type="button">Outside</button>
  </div>
)

const DualToolbarHarness = ({
  activeRef,
  inactiveRef,
}: {
  activeRef: RefObject<HTMLDivElement | null>
  inactiveRef: RefObject<HTMLDivElement | null>
}) => (
  <div>
    <div contentEditable data-testid="active-editor" ref={activeRef} tabIndex={0}>
      active selection
    </div>
    <PlateSelectionToolbarOverlay canEdit={() => true} editableRef={activeRef} labels={labels} />
    <div contentEditable data-testid="inactive-editor" ref={inactiveRef} tabIndex={0}>
      inactive selection
    </div>
    <PlateSelectionToolbarOverlay canEdit={() => true} editableRef={inactiveRef} labels={labels} />
  </div>
)

const createVisualViewport = () =>
  Object.assign(new EventTarget(), {
    height: 768,
    offsetLeft: 0,
    offsetTop: 0,
    onresize: null,
    onscroll: null,
    onscrollend: null,
    pageLeft: 0,
    pageTop: 0,
    scale: 1,
    width: 1024,
  }) as unknown as VisualViewport

const waitForAnimationFrames = async (count = 2) => {
  for (let frame = 0; frame < count; frame += 1) {
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
  }
}

const renderToolbar = () => {
  const editableRef = createRef<HTMLDivElement>()
  const view = render(<ToolbarHarness editableRef={editableRef} />)
  const editor = screen.getByTestId('editor')
  const rect = installNativeSelection(editor)
  act(() => document.dispatchEvent(new Event('selectionchange')))
  return { ...view, editableRef, editor, rect }
}

beforeEach(() => {
  plateContext.readOnly = false
  Object.defineProperties(document.documentElement, {
    clientHeight: { configurable: true, value: 768 },
    clientWidth: { configurable: true, value: 1024 },
  })
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(20)
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(40)
})

afterEach(() => {
  window.getSelection()?.removeAllRanges()
  Reflect.deleteProperty(document.documentElement, 'clientHeight')
  Reflect.deleteProperty(document.documentElement, 'clientWidth')
  if (originalRangeRect) {
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', originalRangeRect)
  } else {
    Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect')
  }
  if (originalVisualViewport) {
    Object.defineProperty(window, 'visualViewport', originalVisualViewport)
  } else {
    Reflect.deleteProperty(window, 'visualViewport')
  }
})

describe('PlateSelectionToolbarOverlay integration', () => {
  it('portals outside transformed ancestors and wires the floating ref to nested scroll updates', async () => {
    const { rect } = renderToolbar()
    const toolbar = await screen.findByRole('toolbar', { name: labels.toolbar })
    const floating = toolbar.closest<HTMLElement>('[data-slot="popover-content"]')!

    expect(screen.getByTestId('transformed-ancestor')).not.toContainElement(floating)
    await waitFor(() => expect(floating.style.left).toBe('92px'))

    rect.left = 120
    rect.right = 184
    fireEvent.scroll(screen.getByTestId('nested-scroller'))

    await waitFor(() => expect(floating.style.left).toBe('132px'))
  })

  it('repositions only the open toolbar for its editor root and visual viewport', async () => {
    const visualViewport = createVisualViewport()
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: visualViewport,
    })
    const { rect, unmount } = renderToolbar()
    const toolbar = await screen.findByRole('toolbar', { name: labels.toolbar })
    const floating = toolbar.closest<HTMLElement>('[data-slot="popover-content"]')!
    await waitFor(() => expect(floating.style.top).toBe('16px'))

    rect.top = 84
    rect.bottom = 104
    fireEvent.scroll(screen.getByTestId('editor'))
    await waitFor(() => expect(floating.style.top).toBe('56px'))

    rect.top = 124
    rect.bottom = 144
    visualViewport.dispatchEvent(new Event('resize'))
    await waitFor(() => expect(floating.style.top).toBe('96px'))

    unmount()
  })

  it('does not update an active toolbar when a second inactive editor scrolls', async () => {
    const activeRef = createRef<HTMLDivElement>()
    const inactiveRef = createRef<HTMLDivElement>()
    render(<DualToolbarHarness activeRef={activeRef} inactiveRef={inactiveRef} />)
    const rect = installNativeSelection(screen.getByTestId('active-editor'))
    act(() => document.dispatchEvent(new Event('selectionchange')))
    const toolbar = await screen.findByRole('toolbar', { name: labels.toolbar })
    const floating = toolbar.closest<HTMLElement>('[data-slot="popover-content"]')!
    await waitFor(() => expect(floating.style.left).toBe('92px'))

    rect.left = 120
    rect.right = 184
    fireEvent.scroll(screen.getByTestId('inactive-editor'))
    await waitForAnimationFrames()
    expect(floating.style.left).toBe('92px')

    fireEvent.scroll(screen.getByTestId('active-editor'))
    await waitFor(() => expect(floating.style.left).toBe('132px'))
  })

  it('does not schedule toolbar work from root scroll while the toolbar is closed', async () => {
    const { editor } = renderToolbar()
    expect(await screen.findByRole('toolbar', { name: labels.toolbar })).toBeVisible()
    fireEvent.compositionStart(editor)
    await waitFor(() =>
      expect(screen.queryByRole('toolbar', { name: labels.toolbar })).not.toBeInTheDocument(),
    )

    const animationFrame = vi.spyOn(window, 'requestAnimationFrame')
    animationFrame.mockClear()
    fireEvent.scroll(editor)
    expect(animationFrame).not.toHaveBeenCalled()
    animationFrame.mockRestore()
  })

  it('hides during IME composition and restores afterward', async () => {
    const { editor } = renderToolbar()
    expect(await screen.findByRole('toolbar', { name: labels.toolbar })).toBeVisible()

    fireEvent.compositionStart(editor)
    expect(screen.queryByRole('toolbar', { name: labels.toolbar })).not.toBeInTheDocument()
    fireEvent.compositionEnd(editor)
    expect(await screen.findByRole('toolbar', { name: labels.toolbar })).toBeVisible()
  })

  it('stays open for toolbar focus and closes when focus leaves both surfaces', async () => {
    renderToolbar()
    expect(await screen.findByRole('toolbar', { name: labels.toolbar })).toBeVisible()

    screen.getByRole('button', { name: labels.bold }).focus()
    await waitFor(() => expect(screen.getByRole('toolbar', { name: labels.toolbar })).toBeVisible())

    screen.getByRole('button', { name: 'Outside' }).focus()
    await waitFor(() =>
      expect(screen.queryByRole('toolbar', { name: labels.toolbar })).not.toBeInTheDocument(),
    )
  })

  it('closes and removes the portal when read-only changes at runtime', async () => {
    const { editableRef, rerender } = renderToolbar()
    expect(await screen.findByRole('toolbar', { name: labels.toolbar })).toBeVisible()
    plateContext.readOnly = true
    rerender(<ToolbarHarness editableRef={editableRef} />)

    await waitFor(() =>
      expect(screen.queryByRole('toolbar', { name: labels.toolbar })).not.toBeInTheDocument(),
    )
    expect(document.querySelector('[data-floating-ui-portal]')).not.toBeInTheDocument()
  })
})
