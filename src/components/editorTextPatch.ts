import type { EditorTextChange } from '@/types/editorChanges'

const MIN_CHECKPOINT_COMPARISON_CHARS = 256
const MAX_PATCH_TO_SNAPSHOT_RATIO = 0.8
const MAX_PATCH_INSERTED_CHARS = 1_048_576

export const createEditorTextPatch = (
  previous: string,
  content: string,
): EditorTextChange[] | null => {
  if (previous === content) return []
  let prefix = 0
  const prefixLimit = Math.min(previous.length, content.length)
  while (prefix < prefixLimit && previous[prefix] === content[prefix]) prefix += 1

  let suffix = 0
  const suffixLimit = Math.min(previous.length - prefix, content.length - prefix)
  while (
    suffix < suffixLimit &&
    previous[previous.length - suffix - 1] === content[content.length - suffix - 1]
  ) {
    suffix += 1
  }

  const insertText = content.slice(prefix, content.length - suffix)
  if (insertText.length > MAX_PATCH_INSERTED_CHARS) return null
  const estimatedPatchChars = insertText.length + 64
  if (
    content.length >= MIN_CHECKPOINT_COMPARISON_CHARS &&
    estimatedPatchChars >= content.length * MAX_PATCH_TO_SNAPSHOT_RATIO
  ) {
    return null
  }
  return [
    {
      offset: prefix,
      delete_length: previous.length - prefix - suffix,
      insert_text: insertText,
    },
  ]
}
