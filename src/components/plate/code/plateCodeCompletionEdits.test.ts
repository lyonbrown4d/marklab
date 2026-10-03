import { createPlateEditor } from 'platejs/react'
import { InsertTextFormat, type CompletionItem } from 'vscode-languageserver-types'
import { describe, expect, it } from 'vitest'
import {
  applyPlateCodeCompletion,
  pointToEmbeddedPosition,
} from '@/components/plate/code/plateCodeCompletionEdits'

const createEditor = () =>
  createPlateEditor({
    value: [
      {
        type: 'code_block',
        lang: 'mermaid',
        children: [
          { type: 'code_line', children: [{ text: 'graph TD' }] },
          { type: 'code_line', children: [{ text: 'fl' }] },
        ],
      },
    ],
  })

describe('Plate code completion edits', () => {
  it('maps a Slate point inside a code line to an embedded position', () => {
    expect(pointToEmbeddedPosition([0], { path: [0, 1, 0], offset: 2 })).toEqual({
      line: 1,
      character: 2,
    })
    expect(pointToEmbeddedPosition([1], { path: [0, 1, 0], offset: 2 })).toBeNull()
  })

  it('applies an LSP text edit and strips snippet tab stops', () => {
    const editor = createEditor()
    const completion: CompletionItem = {
      label: 'flowchart',
      insertTextFormat: InsertTextFormat.Snippet,
      textEdit: {
        range: {
          start: { line: 1, character: 0 },
          end: { line: 1, character: 2 },
        },
        newText: 'flowchart ${1:TD}',
      },
    }

    expect(applyPlateCodeCompletion(editor, [0], completion)).toBe(true)
    expect(editor.api.string([0, 1])).toBe('flowchart TD')
  })
})
