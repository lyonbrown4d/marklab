import { deserializeMd } from '@platejs/markdown'
import type { Value } from 'platejs'
import { createSlateEditor } from 'platejs'
import { describe, expect, it } from 'vitest'
import { plateMarkdownPlugins } from '@/components/plate/plateMarkdownConfig'
import { serializePlateMarkdown } from '@/components/plate/plateMarkdownSerialization'

const createEditor = () => createSlateEditor({ plugins: [...plateMarkdownPlugins] })

describe('serializePlateMarkdown', () => {
  it('preserves a real zero-width space from document text', () => {
    const editor = createEditor()
    const value: Value = [{ type: 'p', children: [{ text: 'before\u200bafter' }] }]

    expect(serializePlateMarkdown(editor, value)).toBe('before\u200bafter\n')
  })

  it('does not emit zero-width sentinels for empty leaves around a link', () => {
    const editor = createEditor()
    const value: Value = [
      {
        type: 'p',
        children: [
          { text: '' },
          { type: 'a', url: './docs.md', children: [{ text: 'Docs' }] },
          { text: '' },
        ],
      },
    ]

    expect(serializePlateMarkdown(editor, value)).toBe('[Docs](./docs.md)\n')
  })

  it('does not emit a zero-width sentinel for an empty link', () => {
    const editor = createEditor()
    const value: Value = [
      { type: 'p', children: [{ type: 'a', url: './docs.md', children: [{ text: '' }] }] },
    ]

    expect(serializePlateMarkdown(editor, value)).toBe('[](./docs.md)\n')
  })

  it('preserves callout markers while keeping escaped marker literals escaped', () => {
    const editor = createEditor()
    const callout = '> [!NOTE]\n> Body'
    const literal = '> \\[!NOTE]\n> Body'

    const serializedCallout = serializePlateMarkdown(editor, deserializeMd(editor, callout))
    const serializedLiteral = serializePlateMarkdown(editor, deserializeMd(editor, literal))

    expect(serializedCallout).toContain('> [!NOTE]')
    expect(serializedCallout).not.toContain('> \\[!NOTE]')
    expect(serializedLiteral).toContain('> \\[!NOTE]')
  })
})
