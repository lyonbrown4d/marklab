import { describe, expect, it } from 'vitest'
import { isEditorChromeTarget } from '@/components/milkdown/editorDom'

describe('editorDom', () => {
  it('treats Milkdown editor content as editor chrome', () => {
    const host = document.createElement('div')
    host.innerHTML = '<div class="ProseMirror"><p><span id="text">text</span></p></div>'
    const target = host.querySelector<HTMLElement>('#text')

    expect(target).not.toBeNull()
    expect(isEditorChromeTarget(target!)).toBe(true)
  })

  it('treats block handles and decoration widgets as editor chrome', () => {
    const host = document.createElement('div')
    host.innerHTML = [
      '<div class="milkdown-block-handle"><button id="handle">drag</button></div>',
      '<article class="embedded-preview-card"><button id="preview">open</button></article>',
      '<div contenteditable="false"><button id="widget">widget</button></div>',
    ].join('')

    expect(isEditorChromeTarget(host.querySelector<HTMLElement>('#handle')!)).toBe(true)
    expect(isEditorChromeTarget(host.querySelector<HTMLElement>('#preview')!)).toBe(true)
    expect(isEditorChromeTarget(host.querySelector<HTMLElement>('#widget')!)).toBe(true)
  })
})
