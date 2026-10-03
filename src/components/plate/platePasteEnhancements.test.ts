import { describe, expect, it } from 'vitest'
import { createPlateEditor } from 'platejs/react'
import { LinkPlugin } from '@platejs/link/react'
import {
  applyPastedUrlToSelection,
  handlePlatePasteLink,
  normalizePastedUrl,
} from '@/components/plate/platePasteEnhancements'

const createEditor = () =>
  createPlateEditor({
    plugins: [LinkPlugin],
    value: [{ type: 'p', children: [{ text: 'Read the guide today' }] }],
  })

describe('Plate paste enhancements', () => {
  it('normalizes HTTP and www links but rejects executable or multi-token values', () => {
    expect(normalizePastedUrl(' https://example.com/docs ')).toBe('https://example.com/docs')
    expect(normalizePastedUrl('www.example.com/docs')).toBe('https://www.example.com/docs')
    expect(normalizePastedUrl('javascript:alert(1)')).toBeNull()
    expect(normalizePastedUrl('https://user:secret@example.com/private')).toBeNull()
    expect(normalizePastedUrl('https://example.com two')).toBeNull()
  })

  it('wraps the selected text in a Plate link without replacing its label', () => {
    const editor = createEditor()
    editor.tf.select({
      anchor: { path: [0, 0], offset: 9 },
      focus: { path: [0, 0], offset: 14 },
    })

    expect(applyPastedUrlToSelection(editor, 'https://example.com/guide')).toBe(true)
    expect(editor.children).toEqual([
      {
        type: 'p',
        children: [
          { text: 'Read the ' },
          { type: 'a', url: 'https://example.com/guide', children: [{ text: 'guide' }] },
          { text: ' today' },
        ],
      },
    ])
  })

  it('leaves collapsed selections, code blocks and non-URLs to normal paste handling', () => {
    const editor = createEditor()
    editor.tf.select({ path: [0, 0], offset: 4 })
    expect(applyPastedUrlToSelection(editor, 'https://example.com')).toBe(false)

    editor.children = [{ type: 'code_block', children: [{ text: 'sample' }] }]
    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 6 },
    })
    expect(applyPastedUrlToSelection(editor, 'https://example.com')).toBe(false)
    expect(applyPastedUrlToSelection(editor, 'plain text')).toBe(false)
  })

  it('prevents the native paste only after applying a selected-text link', () => {
    const editor = createEditor()
    editor.tf.select({
      anchor: { path: [0, 0], offset: 9 },
      focus: { path: [0, 0], offset: 14 },
    })
    const event = new Event('paste', { cancelable: true }) as ClipboardEvent
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: () => 'https://example.com/guide' },
    })

    expect(handlePlatePasteLink(editor, event)).toBe(true)
    expect(event.defaultPrevented).toBe(true)
  })
})
