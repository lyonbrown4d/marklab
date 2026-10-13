import { act, render } from '@testing-library/react'
import { expect, it } from 'vitest'
import { VimCommandStatusSlot } from '@/components/vim/VimCommandStatusSlot'
import { registerVimCommandPanel } from '@/components/vim/vimCommandDock'
import { registerVimKeyboardScope } from '@/components/vim/vimKeyboardScope'

it('hosts the vendor panel while visible and restores it when hidden or unmounted', () => {
  const root = document.createElement('div')
  const editor = document.createElement('textarea')
  const panel = document.createElement('div')
  root.append(editor, panel)
  document.body.append(root)
  const releaseScope = registerVimKeyboardScope(root)
  const releasePanel = registerVimCommandPanel(root, panel)
  try {
    editor.focus()
    const view = render(<VimCommandStatusSlot visible />)
    expect(view.container.querySelector('[data-vim-command-host]')?.firstChild).toBe(panel)
    view.rerender(<VimCommandStatusSlot visible={false} />)
    expect(panel.parentNode).toBe(root)
    view.rerender(<VimCommandStatusSlot visible />)
    expect(view.container.querySelector('[data-vim-command-host]')?.firstChild).toBe(panel)
    act(() => view.unmount())
    expect(panel.parentNode).toBe(root)
  } finally {
    releasePanel()
    releaseScope()
    root.remove()
  }
})
