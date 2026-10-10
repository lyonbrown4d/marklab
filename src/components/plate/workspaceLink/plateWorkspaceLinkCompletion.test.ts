import { createPlateEditor } from 'platejs/react'
import { describe, expect, it } from 'vitest'
import {
  applyPlateWorkspaceLinkItem,
  getPlateWorkspaceLinkTrigger,
} from '@/components/plate/workspaceLink/plateWorkspaceLinkCompletion'

const createEditor = (text: string, offset = text.length, type = 'p') => {
  const editor = createPlateEditor({ value: [{ type, children: [{ text }] }] })
  editor.tf.select({ path: [0, 0], offset })
  return editor
}

describe('Plate workspace-link completion', () => {
  it('finds an open wiki-link query and replaces it with a closed file link', () => {
    const editor = createEditor('See [[tar')
    const trigger = getPlateWorkspaceLinkTrigger(editor)

    expect(trigger).toMatchObject({ query: 'tar', closeLink: true })
    expect(
      trigger &&
        applyPlateWorkspaceLinkItem(editor, trigger, {
          detail: 'notes/Target.md',
          insertText: 'Target',
          kind: 'file',
          label: 'Target',
          replacementLength: 3,
        }),
    ).toBe(true)
    expect(editor.api.string([])).toBe('See [[Target]]')
  })

  it('replaces only the unresolved heading anchor and does not duplicate an existing close', () => {
    const text = '[[Target#ol]]'
    const editor = createEditor(text, text.indexOf(']]'))
    const trigger = getPlateWorkspaceLinkTrigger(editor)

    expect(trigger).toMatchObject({ query: 'Target#ol', closeLink: false })
    expect(
      trigger &&
        applyPlateWorkspaceLinkItem(editor, trigger, {
          insertText: '#overview',
          kind: 'replace-anchor',
          label: 'Replace anchor',
          replacementLength: 3,
        }),
    ).toBe(true)
    expect(editor.api.string([])).toBe('[[Target#overview]]')
  })

  it('does not activate in code blocks, aliases, or completed links', () => {
    expect(
      getPlateWorkspaceLinkTrigger(createEditor('[[target', undefined, 'code_block')),
    ).toBeNull()
    expect(getPlateWorkspaceLinkTrigger(createEditor('[[target|alias'))).toBeNull()
    expect(getPlateWorkspaceLinkTrigger(createEditor('[[target]]'))).toBeNull()
  })
})
