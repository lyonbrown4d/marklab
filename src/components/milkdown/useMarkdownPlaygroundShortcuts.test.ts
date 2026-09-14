import type { Crepe } from '@milkdown/crepe'
import { Editor, defaultValueCtx, editorViewCtx, rootCtx } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { TextSelection, type Plugin } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { closeHistory, history, undo } from '@milkdown/kit/prose/history'
import { $prose } from '@milkdown/kit/utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMarkdownPlaygroundShortcutPlugin,
  resolvePlaygroundShortcutBindings,
} from '@/components/milkdown/useMarkdownPlaygroundShortcuts'
import type { SlashUrlInsertionRequest } from '@/components/milkdown/slashUrlInsertion'

type ShortcutState = ReturnType<Parameters<typeof createMarkdownPlaygroundShortcutPlugin>[0]>

describe('playground shortcuts with real ProseMirror keyboard events', () => {
  let editor: Editor
  let view: EditorView
  let root: HTMLDivElement
  let plugin: Plugin
  let state: ShortcutState
  let pending: SlashUrlInsertionRequest | null

  beforeEach(async () => {
    root = document.createElement('div')
    document.body.append(root)
    pending = null
    plugin = createMarkdownPlaygroundShortcutPlugin(() => state)
    editor = await Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, '**Before** /path after\n\nOther paragraph')
      })
      .use(commonmark)
      .use($prose(() => history()))
      .use($prose(() => plugin))
      .create()
    state = {
      ...resolvePlaygroundShortcutBindings({}, 'windows'),
      crepe: { editor } as Crepe,
      enabled: true,
      onUrlInsert: (request) => {
        pending = request
      },
    }
    view = editor.action((ctx) => ctx.get(editorViewCtx))
    // Keep real transactions and event routing without jsdom's missing layout APIs.
    vi.spyOn(view, 'dispatch').mockImplementation((tr) => {
      view.state = view.state.apply(tr)
    })
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 7)))
    view.dom.focus()
    vi.mocked(view.dispatch).mockClear()
  })

  afterEach(async () => {
    await editor.destroy()
    root.remove()
  })

  const press = (key: string, modifiers: KeyboardEventInit = { ctrlKey: true }) => {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...modifiers,
    })
    view.dom.dispatchEvent(event)
    return event
  }

  const guardedKey = (modifiers: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', {
      key: 'b',
      ctrlKey: true,
      cancelable: true,
      ...modifiers,
    })
    Object.defineProperty(event, 'target', { value: view.dom })
    return { event, handled: plugin.props.handleDOMEvents?.keydown?.call(plugin, view, event) }
  }

  it('runs Ctrl+B once instead of toggling again in the native keymap', () => {
    expect(view.hasFocus()).toBe(true)
    expect(press('b').defaultPrevented).toBe(true)
    expect(view.state.doc.firstChild?.firstChild?.marks).toEqual([])
    expect(view.dispatch).toHaveBeenCalledTimes(1)
  })

  it.each([1, 2, 3, 4, 5, 6])('routes Ctrl+%i to a native Markdown heading', (level) => {
    expect(press(String(level)).defaultPrevented).toBe(true)
    expect(view.state.doc.firstChild?.type.name).toBe('heading')
    expect(view.state.doc.firstChild?.attrs.level).toBe(level)
    press('0')
    expect(view.state.doc.firstChild?.type.name).toBe('paragraph')
  })

  it('clears formatting from Ctrl+Backslash and restores it with a single native undo', () => {
    view.dispatch(view.state.tr.setBlockType(1, 7, view.state.schema.nodes.heading, { level: 2 }))
    view.dispatch(closeHistory(view.state.tr))
    const original = view.state.doc
    vi.mocked(view.dispatch).mockClear()
    expect(press('\\').defaultPrevented).toBe(true)
    expect(view.state.doc.firstChild?.type.name).toBe('paragraph')
    expect(view.state.doc.firstChild?.firstChild?.marks).toEqual([])
    expect(view.dispatch).toHaveBeenCalledTimes(1)
    expect(undo(view.state, view.dispatch)).toBe(true)
    expect(view.state.doc.eq(original)).toBe(true)
  })

  it('opens Ctrl+K through the existing dialog request and keeps text around its selection', () => {
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null)
    expect(press('k').defaultPrevented).toBe(true)
    expect(pending?.initialText).toBe('Before')
    const request = pending as unknown as SlashUrlInsertionRequest
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 13)))
    request.insert({ url: './target.md', text: 'Linked' })
    expect(view.state.doc.firstChild?.textContent).toBe('Linked /path after')
    expect(view.state.doc.lastChild?.textContent).toBe('Other paragraph')
    expect(view.state.doc.firstChild?.firstChild?.marks[0].attrs.href).toBe('./target.md')
    expect(prompt).not.toHaveBeenCalled()
  })

  it('keeps /path when Ctrl+K is pressed at its trailing caret', () => {
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 13)))
    press('k')
    const request = pending as unknown as SlashUrlInsertionRequest
    expect(request.initialText).toBe('')
    request.insert({ url: './target.md', text: 'Linked' })
    expect(view.state.doc.firstChild?.textContent).toBe('Before /pathLinked after')
    expect(view.state.selection.from).toBe(19)
  })

  it('honors custom keys and suppresses their old native default', () => {
    state = {
      ...state,
      ...resolvePlaygroundShortcutBindings({ 'editor.bold': ['Control+Shift+Y'] }, 'windows'),
    }
    const original = view.state.doc
    expect(press('b').defaultPrevented).toBe(true)
    expect(view.state.doc).toBe(original)
    press('y', { ctrlKey: true, shiftKey: true })
    expect(view.state.doc.firstChild?.firstChild?.marks).toEqual([])
  })

  it('does not let a disabled binding fall through to the native bold keymap', () => {
    state = { ...state, ...resolvePlaygroundShortcutBindings({ 'editor.bold': [] }, 'windows') }
    const original = view.state.doc
    expect(press('b').defaultPrevented).toBe(true)
    expect(view.state.doc).toBe(original)
    expect(view.dispatch).not.toHaveBeenCalled()
  })

  it('prioritizes a user assignment over another action using that default', () => {
    state = {
      ...state,
      ...resolvePlaygroundShortcutBindings({ 'editor.link': ['Control+B'] }, 'windows'),
    }
    const original = view.state.doc
    press('b')
    expect(pending?.kind).toBe('link')
    expect(view.state.doc).toBe(original)
  })

  it('resolves the macOS command modifier without changing global defaults', () => {
    state = { ...state, ...resolvePlaygroundShortcutBindings({}, 'mac') }
    press('2', { metaKey: true })
    expect(view.state.doc.firstChild?.attrs.level).toBe(2)
  })

  it.each([{ isComposing: true }, { keyCode: 229 }])('ignores IME events %j', (modifiers) => {
    const result = guardedKey(modifiers)
    expect(result.handled).toBe(false)
    expect(result.event.defaultPrevented).toBe(false)
    expect(view.dispatch).not.toHaveBeenCalled()
  })

  it('does not act when the editor is unfocused or the bridge is disabled', () => {
    const input = document.createElement('input')
    root.append(input)
    input.focus()
    expect(guardedKey().handled).toBe(false)
    view.dom.focus()
    state = { ...state, enabled: false }
    expect(guardedKey().handled).toBe(false)
    expect(view.dispatch).not.toHaveBeenCalled()
  })

  it('does not intercept an embedded input or report unsupported image import as handled', () => {
    const input = document.createElement('input')
    view.dom.append(input)
    const event = new KeyboardEvent('keydown', { key: 'b', ctrlKey: true })
    Object.defineProperty(event, 'target', { value: input })
    expect(plugin.props.handleDOMEvents?.keydown?.call(plugin, view, event)).toBe(false)
    const image = new KeyboardEvent('keydown', { key: 'i', ctrlKey: true, shiftKey: true })
    Object.defineProperty(image, 'target', { value: view.dom })
    expect(plugin.props.handleDOMEvents?.keydown?.call(plugin, view, image)).toBe(false)
    expect(view.dispatch).not.toHaveBeenCalled()
  })

  it('ignores a destroyed or replaced editor instance', () => {
    state = { ...state, crepe: null }
    expect(guardedKey().handled).toBe(false)
    state = { ...state, crepe: { editor: { action: () => null } } as unknown as Crepe }
    expect(guardedKey().handled).toBe(false)
    expect(view.dispatch).not.toHaveBeenCalled()
  })
})
