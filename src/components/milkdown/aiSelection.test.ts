import { history, undo } from '@milkdown/kit/prose/history'
import { Schema } from '@milkdown/kit/prose/model'
import { EditorState, TextSelection } from '@milkdown/kit/prose/state'
import { EditorView } from '@milkdown/kit/prose/view'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyAiReplacement, captureAiSelection } from '@/components/milkdown/aiSelection'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      content: 'text*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', 0],
    },
    text: { group: 'inline' },
  },
})

describe('AI editor selection', () => {
  let root: HTMLDivElement
  let view: EditorView

  beforeEach(() => {
    Object.defineProperty(window, 'scrollBy', { configurable: true, value: vi.fn() })
    root = document.createElement('div')
    document.body.append(root)
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, schema.text('First paragraph')),
      schema.node('paragraph', null, schema.text('Second paragraph')),
    ])
    view = new EditorView(root, {
      state: EditorState.create({ doc, plugins: [history()] }),
      dispatchTransaction: (transaction) => view.updateState(view.state.apply(transaction)),
    })
    vi.spyOn(view, 'coordsAtPos').mockReturnValue({
      left: 380,
      right: 380,
      top: 210,
      bottom: 230,
    })
    vi.spyOn(view.dom, 'getBoundingClientRect').mockReturnValue({
      x: 100,
      y: 100,
      left: 100,
      right: 500,
      top: 100,
      bottom: 400,
      width: 400,
      height: 300,
      toJSON: () => ({}),
    })
  })

  afterEach(() => {
    view?.destroy()
    root.remove()
  })

  it('captures selected text and clamps the companion inside the editor viewport', () => {
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6)))

    const capture = captureAiSelection(view, 'notes/a.md')

    expect(capture?.sourceText).toBe('First')
    expect(capture?.range).toEqual({ from: 1, to: 6 })
    expect(view.coordsAtPos).toHaveBeenCalledWith(16)
    expect(capture?.anchor.left).toBeLessThanOrEqual(8)
    expect(capture?.anchor.top).toBeLessThanOrEqual(112)
  })

  it('expands a collapsed caret to its current text block', () => {
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 5)))

    const capture = captureAiSelection(view, 'notes/a.md')

    expect(capture?.sourceText).toBe('First paragraph')
    expect(capture?.range).toEqual({ from: 1, to: 16 })
  })

  it('applies plain replacement text in one transaction and one undo step', () => {
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6)))
    const capture = captureAiSelection(view, 'notes/a.md')
    expect(capture).not.toBeNull()
    const original = view.state.doc
    const dispatch = vi.spyOn(view, 'dispatch')
    dispatch.mockClear()

    const result = applyAiReplacement(view, capture!, 'notes/a.md', '<b>Changed</b>')

    expect(result).toEqual({ ok: true })
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(view.state.doc.textContent).toContain('<b>Changed</b>')
    expect(view.dom.querySelector('b')).toBeNull()
    expect(undo(view.state, view.dispatch)).toBe(true)
    expect(view.state.doc.eq(original)).toBe(true)
  })

  it('refuses to apply after the document, path, or selection becomes stale', () => {
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6)))
    const capture = captureAiSelection(view, 'notes/a.md')
    expect(capture).not.toBeNull()

    expect(applyAiReplacement(view, capture!, 'notes/b.md', 'Changed')).toEqual({
      ok: false,
      reason: 'path-changed',
    })
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 7)))
    expect(applyAiReplacement(view, capture!, 'notes/a.md', 'Changed')).toEqual({
      ok: false,
      reason: 'selection-changed',
    })
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6)))
    view.dispatch(view.state.tr.insertText('!', 16))
    expect(applyAiReplacement(view, capture!, 'notes/a.md', 'Changed')).toEqual({
      ok: false,
      reason: 'document-changed',
    })
  })

  it('refuses a replacement from a rebuilt, destroyed, or read-only editor', () => {
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6)))
    const capture = captureAiSelection(view, 'notes/a.md')
    expect(capture).not.toBeNull()
    const secondRoot = document.createElement('div')
    const secondView = new EditorView(secondRoot, { state: view.state })

    expect(applyAiReplacement(secondView, capture!, 'notes/a.md', 'Changed')).toEqual({
      ok: false,
      reason: 'editor-changed',
    })
    view.setProps({ editable: () => false })
    expect(applyAiReplacement(view, capture!, 'notes/a.md', 'Changed')).toEqual({
      ok: false,
      reason: 'editor-unavailable',
    })
    view.destroy()
    expect(applyAiReplacement(view, capture!, 'notes/a.md', 'Changed')).toEqual({
      ok: false,
      reason: 'editor-unavailable',
    })
    secondView.destroy()
  })
})
