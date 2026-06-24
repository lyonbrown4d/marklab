import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTypewriterScrollView,
  hasHiddenSelection,
  isEditorDragging,
  isProseMirrorDragging,
  isTypewriterScrollLocked,
} from '@/components/milkdown/typewriterScrollPlugin'

const createState = (head: number) => ({
  selection: { empty: true, head },
  doc: { eq: () => true },
})

type TestView = {
  coordsAtPos: ReturnType<typeof vi.fn>
  dom: HTMLElement
  dragging?: unknown
  hasFocus: () => boolean
  state: ReturnType<typeof createState>
}

const asEditorView = (view: TestView) => view as never

const createView = (dom: HTMLElement, extra: Partial<TestView> = {}): TestView => {
  return {
    coordsAtPos: vi.fn(() => ({ bottom: 124, left: 40, right: 42, top: 104 })),
    dom,
    hasFocus: () => true,
    state: createState(1),
    ...extra,
  }
}

const createEditorDom = () => {
  const shell = document.createElement('div')
  shell.className = 'crepe'

  const viewport = document.createElement('div')
  viewport.className = 'editor-scroll-viewport'
  viewport.scrollTo = vi.fn()
  Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 300 })
  Object.defineProperty(viewport, 'scrollHeight', { configurable: true, value: 900 })
  Object.defineProperty(viewport, 'scrollTop', { configurable: true, value: 0, writable: true })
  Object.defineProperty(viewport, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ bottom: 300, height: 300, left: 0, right: 600, top: 0, width: 600 }),
  })

  const editor = document.createElement('div')
  editor.className = 'ProseMirror'

  viewport.appendChild(editor)
  shell.appendChild(viewport)
  document.body.appendChild(shell)

  return { editor, shell, viewport }
}

describe('typewriterScrollPlugin', () => {
  const originalRequestAnimationFrame = window.requestAnimationFrame
  const originalCancelAnimationFrame = window.cancelAnimationFrame

  beforeEach(() => {
    document.documentElement.dataset.immersiveTypewriter = 'true'
    window.requestAnimationFrame = (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    }
    window.cancelAnimationFrame = vi.fn()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    delete document.documentElement.dataset.immersiveTypewriter
    window.requestAnimationFrame = originalRequestAnimationFrame
    window.cancelAnimationFrame = originalCancelAnimationFrame
    vi.restoreAllMocks()
  })

  it('detects editor drag state from the crepe shell', () => {
    const { editor, shell } = createEditorDom()
    shell.dataset.editorDragging = 'true'

    const view = createView(editor)

    expect(isEditorDragging(asEditorView(view))).toBe(true)
    expect(isTypewriterScrollLocked(asEditorView(view))).toBe(true)
  })

  it('does not treat editors outside a drag session as dragging', () => {
    const { editor } = createEditorDom()
    const view = createView(editor, { dragging: null })

    expect(isEditorDragging(asEditorView(view))).toBe(false)
    expect(isProseMirrorDragging(asEditorView(view))).toBe(false)
    expect(hasHiddenSelection(asEditorView(view))).toBe(false)
    expect(isTypewriterScrollLocked(asEditorView(view))).toBe(false)
  })

  it('does not typewriter-scroll during ProseMirror native dragging', () => {
    const { editor, viewport } = createEditorDom()
    const initialView = createView(editor, {
      dragging: { move: true },
      state: createState(1),
    })
    const nextView = createView(editor, {
      dragging: { move: true },
      state: createState(2),
    })
    const pluginView = createTypewriterScrollView(asEditorView(initialView))

    pluginView.update(asEditorView(nextView))

    expect(isProseMirrorDragging(asEditorView(nextView))).toBe(true)
    expect(isTypewriterScrollLocked(asEditorView(nextView))).toBe(true)
    expect(nextView.coordsAtPos).not.toHaveBeenCalled()
    expect(viewport.scrollTo).not.toHaveBeenCalled()
  })

  it('does not typewriter-scroll while ProseMirror hides the selection', () => {
    const { editor, viewport } = createEditorDom()
    editor.classList.add('ProseMirror-hideselection')
    const initialView = createView(editor, { state: createState(1) })
    const nextView = createView(editor, { state: createState(2) })
    const pluginView = createTypewriterScrollView(asEditorView(initialView))

    pluginView.update(asEditorView(nextView))

    expect(hasHiddenSelection(asEditorView(nextView))).toBe(true)
    expect(isTypewriterScrollLocked(asEditorView(nextView))).toBe(true)
    expect(nextView.coordsAtPos).not.toHaveBeenCalled()
    expect(viewport.scrollTo).not.toHaveBeenCalled()
  })
})
