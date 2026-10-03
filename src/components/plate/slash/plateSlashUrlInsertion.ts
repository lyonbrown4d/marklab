import type { PlateEditor } from 'platejs/react'
import type {
  PlateSlashTrigger,
  PlateSlashUrlInsertionRequest,
} from '@/components/plate/slash/types'

const isUnsafeDestination = (destination: string) => {
  const normalized = [...destination].filter((character) => character.charCodeAt(0) > 32).join('')
  return /^(?:data|javascript|vbscript):/i.test(normalized)
}

export const capturePlateSlashUrlInsertion = (
  editor: PlateEditor,
  kind: PlateSlashUrlInsertionRequest['kind'],
  trigger: PlateSlashTrigger,
): PlateSlashUrlInsertionRequest => {
  const target = editor.api.rangeRef(trigger.range)
  let active = true
  let inserted = false

  const takeTarget = () => {
    if (!active || inserted) throw new Error('The insertion target is no longer current')
    const range = target.unref()
    if (!range) throw new Error('The insertion target is no longer available')
    return range
  }

  return {
    initialText: '',
    kind,
    invalidate: () => {
      if (!active) return
      active = false
      target.unref()
    },
    restoreFocus: () => {
      if (!active) return
      active = false
      const range = target.unref()
      if (range && !inserted) editor.tf.select(range)
      editor.tf.focus()
    },
    insert: ({ text, url }) => {
      const destination = url.trim()
      if (!destination) throw new Error('A URL is required')
      if (isUnsafeDestination(destination)) throw new Error('This URL scheme is not allowed')
      editor.tf.select(takeTarget())
      editor.tf.delete()
      if (kind === 'link') {
        editor.tf.insertNodes({
          children: [{ text: text.trim() || destination }],
          type: 'a',
          url: destination,
        })
      } else {
        editor.tf.insertNodes({
          alt: text.trim(),
          children: [{ text: '' }],
          type: 'img',
          url: destination,
        })
      }
      inserted = true
    },
  }
}
