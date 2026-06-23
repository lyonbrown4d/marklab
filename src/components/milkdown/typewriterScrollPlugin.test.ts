import { describe, expect, it } from 'vitest'
import { isEditorDragging } from '@/components/milkdown/typewriterScrollPlugin'

describe('typewriterScrollPlugin', () => {
  it('detects editor drag state from the crepe shell', () => {
    const shell = document.createElement('div')
    shell.className = 'crepe'
    shell.dataset.editorDragging = 'true'

    const editor = document.createElement('div')
    shell.appendChild(editor)

    expect(isEditorDragging({ dom: editor } as never)).toBe(true)
  })

  it('does not treat editors outside a drag session as dragging', () => {
    const shell = document.createElement('div')
    shell.className = 'crepe'

    const editor = document.createElement('div')
    shell.appendChild(editor)

    expect(isEditorDragging({ dom: editor } as never)).toBe(false)
  })
})
