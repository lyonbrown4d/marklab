import { afterEach, describe, expect, it } from 'vitest'
import { Schema } from '@milkdown/kit/prose/model'
import { EditorState, NodeSelection, Plugin, TextSelection } from '@milkdown/kit/prose/state'
import { EditorView, type EditorProps } from '@milkdown/kit/prose/view'
import { history, redo, undo } from '@milkdown/kit/prose/history'
import { createPasteLinkOnSelectionPlugin } from '@/components/milkdown/pasteEnhancements'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*', toDOM: () => ['p', 0] },
    code_block: {
      group: 'block',
      content: 'text*',
      marks: '',
      code: true,
      toDOM: () => ['pre', 0],
    },
    text: { group: 'inline' },
  },
  marks: {
    link: { attrs: { href: {} }, toDOM: (mark) => ['a', { href: mark.attrs.href }, 0] },
    strong: { toDOM: () => ['strong', 0] },
    code: { code: true, excludes: '_', toDOM: () => ['code', 0] },
  },
})
const views: EditorView[] = []
afterEach(() => {
  for (const view of views.splice(0)) {
    const host = view.dom.parentElement
    view.destroy()
    host?.remove()
  }
})
const createView = ({
  href,
  strong = false,
  code = false,
  block = 'paragraph',
  editable = true,
  nativePaste,
}: {
  href?: string
  strong?: boolean
  code?: boolean
  block?: string
  editable?: boolean
  nativePaste?: EditorProps['handlePaste']
} = {}) => {
  const marks = [
    ...(href ? [schema.marks.link.create({ href })] : []),
    ...(strong ? [schema.marks.strong.create()] : []),
    ...(code ? [schema.marks.code.create()] : []),
  ]
  const doc = schema.node('doc', null, [schema.node(block, null, schema.text('Label', marks))])
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, 1, 6),
    plugins: [
      new Plugin({ props: { handlePaste: nativePaste } }),
      history(),
      createPasteLinkOnSelectionPlugin(schema.marks.link),
    ],
  })
  const host = document.createElement('div')
  document.body.append(host)
  const view = new EditorView(host, { state, editable: () => editable })
  views.push(view)
  return view
}
const pasteEvent = (text: string) => {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
  Object.defineProperty(event, 'clipboardData', {
    value: { getData: (type: string) => (type === 'text/plain' ? text : '') },
  })
  return event
}
const paste = (view: EditorView, text: string) =>
  view.someProp('handleDOMEvents', (handlers) => handlers.paste?.(view, pasteEvent(text))) ?? false
const linkHref = (view: EditorView) =>
  view.state.doc.firstChild?.firstChild?.marks.find((mark) => mark.type === schema.marks.link)
    ?.attrs.href

describe('paste URL onto selected text', () => {
  it('adds a link without replacing selected text or bold formatting', () => {
    const view = createView({ strong: true })
    expect(paste(view, 'https://new.example/docs')).toBe(true)
    expect(view.state.doc.textContent).toBe('Label')
    expect(linkHref(view)).toBe('https://new.example/docs')
    expect(
      view.state.doc.firstChild?.firstChild?.marks.some(
        (mark) => mark.type === schema.marks.strong,
      ),
    ).toBe(true)
    expect(view.state.selection.from).toBe(1)
    expect(view.state.selection.to).toBe(6)
  })

  it('updates an existing link, preserves its label and supports undo/redo', () => {
    const view = createView({ href: 'https://old.example' })
    expect(paste(view, 'https://new.example')).toBe(true)
    expect(linkHref(view)).toBe('https://new.example')
    expect(view.state.doc.textContent).toBe('Label')
    expect(undo(view.state, view.dispatch)).toBe(true)
    expect(linkHref(view)).toBe('https://old.example')
    expect(redo(view.state, view.dispatch)).toBe(true)
    expect(linkHref(view)).toBe('https://new.example')
  })

  it('consumes pasting the same link without turning its label into a URL', () => {
    const view = createView({ href: 'https://same.example' })
    expect(paste(view, 'https://same.example')).toBe(true)
    expect(view.state.doc.textContent).toBe('Label')
  })

  it('normalizes www links while preserving text', () => {
    const view = createView()
    expect(paste(view, 'www.example.com')).toBe(true)
    expect(linkHref(view)).toBe('https://www.example.com')
  })

  it.each(['plain text', 'https://example.com two words', 'javascript:alert(1)'])(
    'leaves %s to normal paste',
    (text) => {
      const view = createView()
      expect(paste(view, text)).toBe(false)
      expect(linkHref(view)).toBeUndefined()
    },
  )

  it.each([{ code: true }, { block: 'code_block' }, { editable: false }])(
    'does not link code or readonly content: %j',
    (options) => {
      const view = createView(options)
      expect(paste(view, 'https://new.example')).toBe(false)
      expect(linkHref(view)).toBeUndefined()
    },
  )

  it('leaves a collapsed caret and node selection to normal paste', () => {
    const view = createView()
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)))
    expect(paste(view, 'https://new.example')).toBe(false)
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 0)))
    expect(paste(view, 'https://new.example')).toBe(false)
  })
})

describe('paste event integration', () => {
  it('handles selected URLs before an earlier clipboard parser', () => {
    let nativeCalls = 0
    const view = createView({
      href: 'https://old.example',
      nativePaste: () => {
        nativeCalls += 1
        return true
      },
    })
    const event = pasteEvent('https://new.example')
    view.dom.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(nativeCalls).toBe(0)
    expect(view.state.doc.textContent).toBe('Label')
    expect(linkHref(view)).toBe('https://new.example')
  })
})
