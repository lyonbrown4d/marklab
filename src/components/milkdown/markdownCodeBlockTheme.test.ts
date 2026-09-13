import { history, undo } from '@codemirror/commands'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMarkdownCodeBlockTheme } from '@/components/milkdown/markdownCodeBlockTheme'

const views: EditorView[] = []
const createView = (theme: ReturnType<typeof createMarkdownCodeBlockTheme>) => {
  const parent = document.createElement('div')
  document.body.append(parent)
  const view = new EditorView({
    doc: 'const value = 1',
    extensions: [history(), theme.extension],
    parent,
  })
  views.push(view)
  return view
}

afterEach(() => {
  views.splice(0).forEach((view) => {
    const parent = view.dom.parentElement
    view.destroy()
    parent?.remove()
  })
})

describe('live code block theme', () => {
  it('switches appearance while retaining text, selection, and undo history', () => {
    const theme = createMarkdownCodeBlockTheme()
    const view = createView(theme)
    view.dispatch({ changes: { from: 14, insert: '0' }, selection: { anchor: 15 } })
    const doc = view.state.doc
    theme.setDarkMode(true)
    expect(view.state.facet(EditorView.darkTheme)).toBe(true)
    expect(view.state.doc).toBe(doc)
    expect(view.state.selection.main.anchor).toBe(15)
    theme.setDarkMode(false)
    expect(view.state.facet(EditorView.darkTheme)).toBe(false)
    expect(undo(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('const value = 1')
  })

  it('applies the current appearance to blocks inserted after a theme switch', async () => {
    const theme = createMarkdownCodeBlockTheme()
    theme.setDarkMode(true)
    const view = createView(theme)
    await Promise.resolve()
    expect(view.state.facet(EditorView.darkTheme)).toBe(true)
  })

  it('uses the latest theme when it changes before a new block finishes mounting', async () => {
    const theme = createMarkdownCodeBlockTheme()
    theme.setDarkMode(true)
    const view = createView(theme)
    theme.setDarkMode(false)
    await Promise.resolve()
    expect(view.state.facet(EditorView.darkTheme)).toBe(false)
  })

  it('does not dispatch to a block destroyed before its deferred theme update', async () => {
    const theme = createMarkdownCodeBlockTheme()
    theme.setDarkMode(true)
    const view = createView(theme)
    const dispatch = vi.spyOn(view, 'dispatch')
    view.destroy()
    theme.setDarkMode(false)
    await Promise.resolve()
    expect(dispatch).not.toHaveBeenCalled()
  })
})
