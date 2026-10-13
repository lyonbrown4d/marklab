import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerVimCommandPanel, setVimCommandHost } from '@/components/vim/vimCommandDock'
import { getVimEditorRoot, registerVimKeyboardScope } from '@/components/vim/vimKeyboardScope'

const dispose: (() => void)[] = []
afterEach(() => {
  setVimCommandHost(null)
  dispose
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup())
  document.body.replaceChildren()
})
const fixture = (engine = 'monaco', modal = false) => {
  const root = document.createElement('div')
  const editor = document.createElement('textarea')
  const panel = document.createElement('div')
  panel.className = engine === 'monaco' ? 'monaco-vim-status' : 'cm-vim-panel'
  const input = document.createElement('input')
  input.value = ':wq test'
  panel.append(input)
  const sibling = document.createElement('div')
  root.append(editor, panel, sibling)
  if (modal) {
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.append(root)
    document.body.append(dialog)
  } else document.body.append(root)
  dispose.push(registerVimKeyboardScope(root))
  const releasePanel = registerVimCommandPanel(root, panel)
  dispose.push(releasePanel)
  return { root, editor, panel, input, sibling, releasePanel }
}
const makeHost = () => {
  const host = document.createElement('div')
  document.body.append(host)
  setVimCommandHost(host)
  return host
}

describe('Vim app status command dock', () => {
  it('keeps the panel inline without a host and docks the focused editor without recreating DOM', () => {
    const source = fixture()
    source.editor.focus()
    expect(source.panel.parentNode).toBe(source.root)
    const host = makeHost()
    expect(host.firstElementChild).toBe(source.panel)
    expect(source.input.value).toBe(':wq test')
    source.input.focus()
    expect(getVimEditorRoot(source.input)).toBe(source.root)
  })

  it('preserves command focus, value and selection when hiding/showing the footer', () => {
    const source = fixture()
    source.input.focus()
    source.input.setSelectionRange(1, 4, 'backward')
    const host = makeHost()
    expect(document.activeElement).toBe(source.input)
    expect(source.input.selectionStart).toBe(1)
    expect(source.input.selectionEnd).toBe(4)
    expect(source.input.selectionDirection).toBe('backward')
    setVimCommandHost(null)
    expect(source.panel.parentNode).toBe(source.root)
    expect(source.panel.nextSibling).toBe(source.sibling)
    expect(document.activeElement).toBe(source.input)
    expect(source.input.value).toBe(':wq test')
    setVimCommandHost(host)
    expect(source.panel.parentNode).toBe(host)
    expect(source.input.selectionDirection).toBe('backward')
  })

  it('restores the previous engine panel before docking another and retains the last panel outside editing', () => {
    const first = fixture('monaco')
    const second = fixture('codemirror')
    const host = makeHost()
    first.editor.focus()
    expect(first.panel.parentNode).toBe(host)
    second.editor.focus()
    expect(first.panel.parentNode).toBe(first.root)
    expect(first.panel.nextSibling).toBe(first.sibling)
    expect(second.panel.parentNode).toBe(host)
    const button = document.createElement('button')
    document.body.append(button)
    button.focus()
    expect(second.panel.parentNode).toBe(host)
  })

  it('restores panel ownership when the editor disposes or host unmounts', () => {
    const source = fixture()
    const host = makeHost()
    source.editor.focus()
    source.releasePanel()
    expect(source.panel.parentNode).toBe(source.root)
    expect(host.children).toHaveLength(0)
    expect(source.panel).not.toHaveAttribute('data-vim-command-panel')
    setVimCommandHost(null)
    host.remove()
    expect(source.panel.parentNode).toBe(source.root)
  })

  it('keeps commands inside dialogs and restores the preceding docked panel', () => {
    const source = fixture()
    const modal = fixture('monaco', true)
    const host = makeHost()
    source.editor.focus()
    expect(source.panel.parentNode).toBe(host)
    modal.editor.focus()
    expect(modal.panel.parentNode).toBe(modal.root)
    expect(source.panel.parentNode).toBe(source.root)
    expect(host.children).toHaveLength(0)
    modal.input.focus()
    expect(getVimEditorRoot(modal.input)).toBe(modal.root)
  })

  it('keeps vendor prompts open during relocation and restores ordinary blur handling afterward', () => {
    const source = fixture()
    source.input.focus()
    const closePrompt = vi.fn(() => {
      source.input.value = ''
    })
    source.input.addEventListener('blur', closePrompt)
    const host = document.createElement('div')
    document.body.append(host)
    const insert = host.insertBefore.bind(host)
    vi.spyOn(host, 'insertBefore').mockImplementation((node, next) => {
      source.input.dispatchEvent(new FocusEvent('blur'))
      return insert(node, next)
    })
    setVimCommandHost(host)
    expect(source.input.value).toBe(':wq test')
    expect(closePrompt).not.toHaveBeenCalled()
    source.input.dispatchEvent(new FocusEvent('blur'))
    expect(closePrompt).toHaveBeenCalledOnce()
  })

  it('uses the inline fallback for a hidden footer host', () => {
    const source = fixture()
    const host = makeHost()
    host.hidden = true
    source.editor.focus()
    expect(source.panel.parentNode).toBe(source.root)
    host.hidden = false
    setVimCommandHost(host)
    expect(source.panel.parentNode).toBe(host)
  })
})
