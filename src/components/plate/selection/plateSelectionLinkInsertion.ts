import type { PlateEditor } from 'platejs/react'
import { upsertLink } from '@platejs/link'
import type { PlateSlashUrlInsertionRequest } from '@/components/plate/slash'

const isUnsafeDestination = (destination: string) => {
  const normalized = [...destination].filter((character) => character.charCodeAt(0) > 32).join('')
  return /^(?:data|javascript|vbscript):/i.test(normalized)
}

export const capturePlateSelectionLinkInsertion = (
  editor: PlateEditor,
): PlateSlashUrlInsertionRequest | null => {
  if (!editor.selection || !editor.api.isExpanded()) return null
  const target = editor.api.rangeRef(editor.selection)
  const initialText = editor.api.string(editor.selection)
  let active = true
  let inserted = false

  const takeTarget = () => {
    if (!active || inserted) throw new Error('The link target is no longer current')
    const range = target.unref()
    if (!range) throw new Error('The link target is no longer available')
    return range
  }

  return {
    initialText,
    kind: 'link',
    invalidate: () => {
      active = false
      target.unref()
    },
    restoreFocus: () => {
      if (!active) return
      const range = target.current
      if (range && !inserted) editor.tf.select(range)
      editor.tf.focus()
    },
    insert: ({ text, url }) => {
      const destination = url.trim()
      if (!destination || isUnsafeDestination(destination)) {
        throw new Error('This URL is not allowed')
      }
      editor.tf.select(takeTarget())
      upsertLink(editor, {
        skipValidation: true,
        text: text.trim() || initialText || destination,
        url: destination,
      })
      inserted = true
    },
  }
}
