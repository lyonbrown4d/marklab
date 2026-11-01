import { act, renderHook } from '@testing-library/react'
import { createPlateEditor } from 'platejs/react'
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMarkdownEditorPosition } from '@/components/editor/useMarkdownEditorPosition'
import { clearPendingHeadingNavigation, requestFocusHeading } from '@/utils/editorNavigation'

let frames: FrameRequestCallback[] = []
const flushFrames = () => {
  const pending = frames.splice(0)
  pending.forEach((callback) => callback(performance.now()))
}
const createSurface = () => {
  const root = document.createElement('div')
  const editable = document.createElement('div')
  editable.dataset.editorEngine = 'plate'
  Object.defineProperties(editable, {
    clientHeight: { configurable: true, value: 200 },
    scrollHeight: { configurable: true, value: 1_000, writable: true },
  })
  root.append(editable)
  const rootRef = createRef<HTMLDivElement>()
  rootRef.current = root
  return { editable, rootRef }
}
const createEditor = () =>
  createPlateEditor({ value: [{ type: 'p', children: [{ text: 'Current document' }] }] })

beforeEach(() => {
  frames = []
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback)
    return frames.length
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
})
afterEach(() => {
  clearPendingHeadingNavigation()
  vi.restoreAllMocks()
})

describe('Markdown editor return position', () => {
  it('restores the caret and exact scroll after a graph visit without focusing the editor', () => {
    const editor = createEditor()
    const { editable, rootRef } = createSurface()
    const getEditor = () => editor
    const { rerender } = renderHook(
      ({ active }) =>
        useMarkdownEditorPosition({
          activePath: 'return-position.md',
          workspaceKey: 'internal:/one',
          active,
          ready: true,
          rootRef,
          getEditor,
        }),
      { initialProps: { active: true } },
    )
    act(() => editor.tf.select({ path: [0, 0], offset: 8 }))
    editable.scrollTop = 400
    editable.scrollLeft = 12
    rerender({ active: false })
    act(() => editor.tf.deselect())
    editable.scrollTop = 0
    editable.scrollLeft = 0
    const focus = vi.spyOn(editor.tf, 'focus')
    rerender({ active: true })
    act(flushFrames)
    expect(editor.selection?.anchor).toEqual({ path: [0, 0], offset: 8 })
    expect(editable.scrollTop).toBe(400)
    expect(editable.scrollLeft).toBe(12)
    expect(focus).not.toHaveBeenCalled()
  })

  it('uses scroll progress when content changed and isolates snapshots by workspace', () => {
    const editor = createEditor()
    const { editable, rootRef } = createSurface()
    const getEditor = () => editor
    const { rerender } = renderHook(
      ({ active, workspaceKey }) =>
        useMarkdownEditorPosition({
          activePath: 'changed-position.md',
          workspaceKey,
          active,
          ready: true,
          rootRef,
          getEditor,
        }),
      { initialProps: { active: true, workspaceKey: 'internal:/one' } },
    )
    act(() => editor.tf.select({ path: [0, 0], offset: 8 }))
    editable.scrollTop = 400
    rerender({ active: false, workspaceKey: 'internal:/one' })
    act(() => {
      editor.tf.deselect()
      editor.children = [{ type: 'p', children: [{ text: 'Replaced' }] }]
    })
    editable.scrollTop = 0
    Object.defineProperty(editable, 'scrollHeight', { value: 1_800 })
    rerender({ active: true, workspaceKey: 'internal:/one' })
    act(flushFrames)
    expect(editor.selection).toBeNull()
    expect(editable.scrollTop).toBe(800)
    rerender({ active: false, workspaceKey: 'internal:/one' })
    editable.scrollTop = 0
    rerender({ active: true, workspaceKey: 'internal:/two' })
    act(flushFrames)
    expect(editable.scrollTop).toBe(0)
    expect(editor.selection).toBeNull()
  })

  it('lets an explicit heading request override a saved return position', () => {
    const editor = createEditor()
    const { editable, rootRef } = createSurface()
    const getEditor = () => editor
    const { rerender } = renderHook(
      ({ active }) =>
        useMarkdownEditorPosition({
          activePath: 'heading-position.md',
          workspaceKey: 'internal:/one',
          active,
          ready: true,
          rootRef,
          getEditor,
        }),
      { initialProps: { active: true } },
    )
    act(() => editor.tf.select({ path: [0, 0], offset: 8 }))
    editable.scrollTop = 400
    rerender({ active: false })
    act(() => {
      editor.tf.deselect()
      requestFocusHeading({
        path: 'heading-position.md',
        slug: 'next',
        workspaceKey: 'internal:/one',
      })
    })
    editable.scrollTop = 90
    rerender({ active: true })
    act(flushFrames)
    expect(editor.selection).toBeNull()
    expect(editable.scrollTop).toBe(90)
  })
})
