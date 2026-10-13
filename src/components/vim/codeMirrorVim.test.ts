import { Compartment, EditorState } from '@codemirror/state'
import { history, undo } from '@codemirror/commands'
import { EditorView } from '@codemirror/view'
import * as vimModule from '@replit/codemirror-vim'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { attachCodeMirrorVim } from '@/components/vim/codeMirrorVim'
import { isVimKeyboardTarget } from '@/components/vim/vimKeyboardScope'

const rangeDescriptors = Object.getOwnPropertyDescriptors(Range.prototype)
beforeAll(() => {
  Object.defineProperties(Range.prototype, {
    getClientRects: { configurable: true, value: () => [] },
    getBoundingClientRect: { configurable: true, value: () => new DOMRect() },
  })
})
afterAll(() => {
  for (const key of ['getClientRects', 'getBoundingClientRect']) {
    const descriptor = rangeDescriptors[key]
    if (descriptor) Object.defineProperty(Range.prototype, key, descriptor)
    else Reflect.deleteProperty(Range.prototype, key)
  }
})
const resources: (() => void)[] = []
afterEach(() => {
  resources
    .splice(0)
    .reverse()
    .forEach((dispose) => dispose())
})
const fixture = () => {
  const root = document.createElement('div')
  document.body.append(root)
  const compartment = new Compartment()
  const view = new EditorView({
    parent: root,
    state: EditorState.create({
      doc: 'first second\nthird',
      extensions: [history(), compartment.of([])],
    }),
  })
  resources.push(() => {
    view.destroy()
    root.remove()
  })
  return { view, root, compartment }
}
const ready = async () => {
  await vi.waitFor(() => expect(document.querySelector('[data-vim-active]')).not.toBeNull())
}
const command = (view: EditorView, text: string) => {
  const cm = vimModule.getCM(view)!
  vimModule.Vim.handleEx(cm as Parameters<typeof vimModule.Vim.handleEx>[0], text)
}

describe('CodeMirror Vim lifecycle and real engine', () => {
  it('uses Vim motions, insert, visual, search and Ex routes for each editor', async () => {
    const first = fixture()
    const second = fixture()
    const write = vi.fn()
    const secondWrite = vi.fn()
    const attach = (editor: ReturnType<typeof fixture>, handler: typeof write) =>
      attachCodeMirrorVim({
        ...editor,
        handlers: { write: handler, quit: vi.fn() },
        isCurrent: () => true,
        onStatus: vi.fn(),
      })
    resources.push(attach(first, write), attach(second, secondWrite))
    await ready()
    const cm = vimModule.getCM(first.view)!
    vimModule.Vim.handleKey(cm, 'w', 'user')
    expect(first.view.state.selection.main.head).toBe(6)
    vimModule.Vim.handleKey(cm, 'v', 'user')
    expect(first.root.dataset.vimMode).toContain('VISUAL')
    vimModule.Vim.handleKey(cm, '<Esc>', 'user')
    vimModule.Vim.handleKey(cm, 'i', 'user')
    expect(first.root.dataset.vimMode).toBe('INSERT')
    vimModule.Vim.handleKey(cm, '<Esc>', 'user')
    expect(first.root.dataset.vimMode).toBe('NORMAL')
    vimModule.Vim.handleKey(cm, '/', 'user')
    await vi.waitFor(() =>
      expect(first.root.querySelector('input')?.getAttribute('aria-label')).toBe('Vim search'),
    )
    command(first.view, 'w')
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce())
    expect(secondWrite).not.toHaveBeenCalled()
    command(second.view, 'write')
    await vi.waitFor(() => expect(secondWrite).toHaveBeenCalledOnce())
  })

  it('runs quit and write-quit in order and ignores duplicate pending commands', async () => {
    const editor = fixture()
    const calls: string[] = []
    let completeWrite!: () => void
    resources.push(
      attachCodeMirrorVim({
        ...editor,
        isCurrent: () => true,
        onStatus: vi.fn(),
        handlers: {
          write: () => {
            calls.push('write')
            return new Promise<void>((resolve) => {
              completeWrite = resolve
            })
          },
          quit: () => {
            calls.push('quit')
          },
        },
      }),
    )
    await ready()
    command(editor.view, 'q')
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(calls).toEqual(['quit'])
    command(editor.view, 'wq')
    command(editor.view, 'wq')
    expect(calls).toEqual(['quit', 'write'])
    completeWrite()
    await vi.waitFor(() => expect(calls).toEqual(['quit', 'write', 'quit']))
  })

  it('preserves document, selection and undo history across toggles and cleans scope', async () => {
    const editor = fixture()
    editor.view.dispatch({ changes: { from: 0, insert: 'new ' }, selection: { anchor: 6 } })
    const attach = () =>
      attachCodeMirrorVim({
        ...editor,
        handlers: { write: vi.fn(), quit: vi.fn() },
        isCurrent: () => true,
        onStatus: vi.fn(),
      })
    const dispose = attach()
    await ready()
    expect(isVimKeyboardTarget(editor.view.contentDOM)).toBe(true)
    dispose()
    expect(isVimKeyboardTarget(editor.view.contentDOM)).toBe(false)
    expect(vimModule.getCM(editor.view)).toBeNull()
    expect(editor.view.state.doc.toString()).toBe('new first second\nthird')
    expect(editor.view.state.selection.main.head).toBe(6)
    resources.push(attach())
    await ready()
    expect(undo(editor.view)).toBe(true)
    expect(editor.view.state.doc.toString()).toBe('first second\nthird')
  })

  it('cancels pending lazy load and reports a load error without claiming a keyboard scope', async () => {
    const editor = fixture()
    let resolve!: (module: typeof vimModule) => void
    const status = vi.fn()
    const dispose = attachCodeMirrorVim({
      ...editor,
      handlers: { write: vi.fn(), quit: vi.fn() },
      isCurrent: () => true,
      onStatus: status,
      load: () =>
        new Promise((done) => {
          resolve = done
        }),
    })
    dispose()
    resolve(vimModule)
    await Promise.resolve()
    expect(status).toHaveBeenCalledExactlyOnceWith('loading')
    expect(vimModule.getCM(editor.view)).toBeNull()
    resources.push(
      attachCodeMirrorVim({
        ...editor,
        handlers: { write: vi.fn(), quit: vi.fn() },
        isCurrent: () => true,
        onStatus: status,
        load: () => Promise.reject(new Error('offline')),
      }),
    )
    await vi.waitFor(() => expect(status).toHaveBeenLastCalledWith('loadError'))
    expect(isVimKeyboardTarget(editor.view.contentDOM)).toBe(false)
  })

  it('prevents a delayed write-quit from closing a disposed editor and handles failed writes', async () => {
    const editor = fixture()
    let resolve!: () => void
    const quit = vi.fn()
    const status = vi.fn()
    const dispose = attachCodeMirrorVim({
      ...editor,
      handlers: {
        write: () =>
          new Promise<void>((done) => {
            resolve = done
          }),
        quit,
      },
      isCurrent: () => true,
      onStatus: status,
    })
    await ready()
    command(editor.view, 'wq')
    dispose()
    resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(quit).not.toHaveBeenCalled()
    resources.push(
      attachCodeMirrorVim({
        ...editor,
        handlers: { write: () => Promise.reject(new Error('disk full')), quit },
        isCurrent: () => true,
        onStatus: status,
      }),
    )
    await ready()
    command(editor.view, 'wq')
    await vi.waitFor(() => expect(status).toHaveBeenLastCalledWith('commandError'))
    expect(quit).not.toHaveBeenCalled()
  })
})
