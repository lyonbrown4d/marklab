import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  parserCtx,
  rootCtx,
  serializerCtx,
} from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { TextSelection } from '@milkdown/kit/prose/state'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  captureSlashUrlInsertion,
  type SlashUrlInsertionRequest,
} from '@/components/milkdown/slashUrlInsertion'
import { createMarkdownPlaygroundSlashConfig } from '@/components/milkdown/slashMenuConfig'
import { slashMenuTestLabels as labels } from '@/components/milkdown/slashMenuConfigTestFixtures'

describe('slash URL insertion with the native Markdown schema', () => {
  let editor: Editor
  let root: HTMLDivElement
  beforeEach(async () => {
    root = document.createElement('div')
    document.body.append(root)
    editor = await Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, 'Before /link after\n\nOther paragraph')
      })
      .use(commonmark)
      .create()
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      // Apply real transactions without jsdom's missing layout APIs.
      vi.spyOn(view, 'dispatch').mockImplementation((tr) => {
        view.state = view.state.apply(tr)
      })
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 13)))
    })
  })
  afterEach(async () => {
    await editor.destroy()
    root.remove()
  })

  it.each(['link', 'image-url'] as const)(
    'routes %s to a captured dialog request without prompting',
    (kind) => {
      editor.action((ctx) => {
        const onUrlInsert = vi.fn()
        const addItem = vi.fn()
        const config = createMarkdownPlaygroundSlashConfig({
          labels,
          onImageImport: async () => false,
          onCalendarFileCreate: async () => null,
          onUrlInsert,
        })
        config.buildMenu?.({ getGroup: () => ({ addItem }) } as never)
        const item = addItem.mock.calls.find(([key]) => key === kind)?.[1]
        item.onRun(ctx)
        const request = onUrlInsert.mock.calls[0][0] as SlashUrlInsertionRequest
        expect(request.kind).toBe(kind)
        expect(ctx.get(editorViewCtx).state.doc.textContent).toContain('/link')
      })
    },
  )

  it.each(['link', 'image-url'] as const)(
    'round-trips literal %s text and URL through Markdown',
    (kind) => {
      editor.action((ctx) => {
        const request = captureSlashUrlInsertion(ctx, kind)
        const view = ctx.get(editorViewCtx)
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)))
        const url = 'https://example.com/a (b)/c?x=1&y=2'
        const text = '[literal] *not bold* \\ tail'
        request.insert({ url, text })
        const insertionEnd = 8 + (kind === 'link' ? text.length : 1)
        expect(view.state.selection.empty).toBe(true)
        expect(view.state.selection.from).toBe(insertionEnd)
        const focus = vi.spyOn(view, 'focus').mockImplementation(() => {})
        request.restoreFocus()
        expect(focus).toHaveBeenCalledOnce()
        expect(view.state.selection.from).toBe(insertionEnd)
        const markdown = ctx.get(serializerCtx)(view.state.doc)
        const parsed = ctx.get(parserCtx)(markdown)!
        expect(parsed.childCount).toBe(2)
        const inserted = parsed.firstChild!.child(1)
        if (kind === 'link') {
          expect(inserted.text).toBe(text)
          expect(inserted.marks.map((mark) => mark.type.name)).toEqual(['link'])
          expect(inserted.marks[0].attrs.href).toBe(url)
        } else {
          expect(inserted.type.name).toBe('image')
          expect(inserted.attrs.src).toBe(url)
          expect(inserted.attrs.alt).toBe(text)
        }
        expect(parsed.firstChild!.firstChild!.text).toBe('Before ')
        expect(parsed.firstChild!.lastChild!.text).toBe(' after')
        expect(parsed.lastChild!.textContent).toBe('Other paragraph')
        expect(() => request.insert({ url, text })).toThrow('no longer current')
      })
    },
  )

  it('prefills selected text, preserves its target, and defaults empty link text to the URL', () => {
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 7)))
      const request = captureSlashUrlInsertion(ctx, 'link')
      expect(request.initialText).toBe('Before')
      request.insert({ url: ' ./note.md ', text: '' })
      expect(view.state.doc.firstChild!.firstChild!.text).toBe('./note.md')
      expect(view.state.doc.textContent).toContain(' /link after')
    })
  })

  it('keeps a literal /path prefix for keyboard insertion at an empty selection', () => {
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      const tr = view.state.tr.insertText('/path', 8, 13)
      view.dispatch(tr.setSelection(TextSelection.create(tr.doc, 13)))
      const request = captureSlashUrlInsertion(ctx, 'link', { consumeSlash: false })
      expect(request.initialText).toBe('')
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)))
      request.insert({ url: './target.md', text: 'Label' })
      expect(view.state.doc.firstChild?.textContent).toBe('Before /pathLabel after')
      expect(view.state.doc.firstChild?.firstChild?.text).toBe('Before /path')
      expect(view.state.doc.firstChild?.lastChild?.text).toBe(' after')
      expect(view.state.doc.lastChild?.textContent).toBe('Other paragraph')
      expect(view.state.selection.from).toBe(18)
      const focus = vi.spyOn(view, 'focus').mockImplementation(() => {})
      request.restoreFocus()
      expect(focus).toHaveBeenCalledOnce()
      expect(view.state.selection.from).toBe(18)
    })
  })

  it('replaces only the captured keyboard selection even if dialog focus moves the caret', () => {
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 8, 13)))
      const request = captureSlashUrlInsertion(ctx, 'link', { consumeSlash: false })
      expect(request.initialText).toBe('/link')
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)))
      request.insert({ url: './target.md', text: 'Label' })
      expect(view.state.doc.firstChild?.textContent).toBe('Before Label after')
      expect(view.state.doc.firstChild?.firstChild?.text).toBe('Before ')
      expect(view.state.doc.firstChild?.lastChild?.text).toBe(' after')
      expect(view.state.doc.lastChild?.textContent).toBe('Other paragraph')
      expect(view.state.selection.from).toBe(13)
    })
  })

  it('restores selection without mutation on cancel and rejects invalidation', () => {
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      const original = view.state.doc
      const request = captureSlashUrlInsertion(ctx, 'link')
      vi.spyOn(view, 'focus').mockImplementation(() => {})
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)))
      request.restoreFocus()
      expect(view.state.selection.from).toBe(13)
      expect(view.state.doc).toBe(original)
      request.invalidate()
      expect(() => request.insert({ url: '/x', text: '' })).toThrow('no longer current')
      request.restoreFocus()
      expect(view.focus).toHaveBeenCalledOnce()
      expect(view.state.doc).toBe(original)
    })
  })

  it('rejects changed documents and empty URLs without insertion', () => {
    editor.action((ctx) => {
      const request = captureSlashUrlInsertion(ctx, 'image-url')
      expect(() => request.insert({ url: ' ', text: '' })).toThrow('URL is required')
      const view = ctx.get(editorViewCtx)
      view.dispatch(view.state.tr.insertText('changed', 1))
      const changed = view.state.doc
      expect(() => request.insert({ url: '/image.png', text: '' })).toThrow('no longer current')
      const focus = vi.spyOn(view, 'focus').mockImplementation(() => {})
      const selection = view.state.selection
      request.restoreFocus()
      expect(focus).not.toHaveBeenCalled()
      expect(view.state.selection).toBe(selection)
      expect(view.state.doc).toBe(changed)
    })
  })
})
