import { EditorView } from '@codemirror/view'
import { getCM, Vim } from '@replit/codemirror-vim'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import MermaidCodeEditor from '@/components/previews/MermaidCodeEditor'
import { setVimCommandHost } from '@/components/vim/vimCommandDock'
import { getVimEditorRoot } from '@/components/vim/vimKeyboardScope'

const context = vi.hoisted(() => ({ active: true, cacheKey: 'editor-tab' }))
vi.mock('keepalive-for-react', () => ({ useKeepAliveContext: () => context }))
vi.mock('@/components/vim/useEditorVimMode', () => ({ useCurrentTabVimModeEnabled: () => true }))
vi.mock('@/components/plate/code/mermaidCodeMirrorLanguage', () => ({
  createMermaidCodeMirrorIntelligence: () => ({ extensions: [], dispose: vi.fn() }),
}))
vi.mock('@/hooks/useDarkMode', () => ({ useDarkMode: () => true }))
vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({ t: translate }),
}))
const translate = (key: string) =>
  ({
    'preview.mermaidEditSource': '编辑 Mermaid 源码',
    'editor.vimStatusLabel': 'Vim 模式与命令行',
    'editor.vimCommandLabel': 'Vim 命令',
    'editor.vimSearchLabel': 'Vim 搜索',
  })[key] ?? key
const descriptors = Object.getOwnPropertyDescriptors(Range.prototype)
beforeAll(() => {
  Object.defineProperties(Range.prototype, {
    getClientRects: { configurable: true, value: () => [] },
    getBoundingClientRect: { configurable: true, value: () => new DOMRect() },
  })
})
afterAll(() => {
  for (const key of ['getClientRects', 'getBoundingClientRect']) {
    const descriptor = descriptors[key]
    if (descriptor) Object.defineProperty(Range.prototype, key, descriptor)
    else Reflect.deleteProperty(Range.prototype, key)
  }
})
afterEach(() => {
  setVimCommandHost(null)
  context.active = true
})
const fixture = () => {
  const onBlur = vi.fn()
  const props = {
    onBlur,
    onChange: vi.fn(),
    uri: 'marklab-embedded://plate/diagram.mermaid',
    value: 'flowchart LR\n A-->B',
  }
  const result = render(
    <div>
      <MermaidCodeEditor {...props} />
      <footer data-testid="dock" />
    </div>,
  )
  const root = result.container.querySelector<HTMLElement>('[data-mermaid-code-editor]')!
  const view = EditorView.findFromDOM(root.querySelector<HTMLElement>('.cm-editor')!)!
  const host = result.getByTestId('dock')
  setVimCommandHost(host)
  const rerender = () =>
    result.rerender(
      <div>
        <MermaidCodeEditor {...props} />
        <footer data-testid="dock" />
      </div>,
    )
  return { ...result, root, view, host, onBlur, rerender }
}

describe('Mermaid Vim command focus and inactive tab lifecycle', () => {
  it('keeps the editor open when translated Ex/search input receives focus in the app dock', async () => {
    const editor = fixture()
    await waitFor(() => expect(editor.root).toHaveAttribute('data-vim-active', 'true'))
    const cm = getCM(editor.view)!
    Vim.handleKey(cm, 'i', 'user')
    Vim.handleKey(cm, '<Esc>', 'user')
    expect(editor.root).toHaveAttribute('data-vim-mode', 'NORMAL')
    fireEvent.keyDown(editor.view.contentDOM, {
      key: ':',
      code: 'Semicolon',
      shiftKey: true,
      keyCode: 186,
    })
    const command = await editor.findByRole('textbox', { name: 'Vim 命令' })
    expect(command).toHaveFocus()
    expect(editor.host).toContainElement(command)
    expect(getVimEditorRoot(command)).toBe(editor.root)
    await new Promise<void>((resolve) => setTimeout(resolve, 10))
    expect(editor.onBlur).not.toHaveBeenCalled()
    fireEvent.keyDown(command, { key: 'Escape', keyCode: 27 })
    expect(editor.view.hasFocus).toBe(true)
    Vim.handleKey(cm, '/', 'user')
    const search = await editor.findByRole('textbox', { name: 'Vim 搜索' })
    expect(search).toHaveFocus()
    await new Promise<void>((resolve) => setTimeout(resolve, 10))
    expect(editor.onBlur).not.toHaveBeenCalled()
    fireEvent.keyDown(search, { key: 'Escape', keyCode: 27 })
    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()
    await waitFor(() => expect(editor.onBlur).toHaveBeenCalledOnce())
    outside.remove()
  })

  it('removes inactive keepalive command scopes and restores the same document and selection when active', async () => {
    const editor = fixture()
    await waitFor(() => expect(editor.root).toHaveAttribute('data-vim-active', 'true'))
    editor.view.dispatch({ changes: { from: 0, insert: '%% note\n' }, selection: { anchor: 8 } })
    Vim.handleKey(getCM(editor.view)!, ':', 'user')
    const input = await editor.findByRole('textbox', { name: 'Vim 命令' })
    expect(input).toHaveFocus()
    const document = editor.view.state.doc.toString()
    const selection = editor.view.state.selection
    context.active = false
    editor.rerender()
    await waitFor(() => expect(editor.root).not.toHaveAttribute('data-vim-active'))
    expect(getVimEditorRoot(input)).toBeNull()
    expect(editor.host).toBeEmptyDOMElement()
    expect(getCM(editor.view)).toBeNull()
    context.active = true
    editor.rerender()
    await waitFor(() => expect(editor.root).toHaveAttribute('data-vim-active', 'true'))
    expect(editor.view.state.doc.toString()).toBe(document)
    expect(editor.view.state.selection.eq(selection)).toBe(true)
    expect(getCM(editor.view)).not.toBeNull()
  })
})
