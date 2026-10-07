import type { EditorTextChange } from '@/types/editorChanges'

type MonacoTextChange = {
  rangeOffset: number
  rangeLength: number
  text: string
}

export const toEditorTextChanges = (changes: readonly MonacoTextChange[]): EditorTextChange[] =>
  changes
    .map((change) => ({
      offset: change.rangeOffset,
      delete_length: change.rangeLength,
      insert_text: change.text,
    }))
    .sort((left, right) => left.offset - right.offset)
