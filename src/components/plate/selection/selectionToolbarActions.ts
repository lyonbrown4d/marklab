import { unwrapLink } from '@platejs/link'
import { triggerFloatingLink } from '@platejs/link/react'
import type { PlateEditor } from 'platejs/react'

export const plateSelectionToolbarActions = [
  'bold',
  'italic',
  'strike',
  'code',
  'link',
  'clear',
] as const

export type PlateSelectionToolbarAction = (typeof plateSelectionToolbarActions)[number]

export type PlateSelectionToolbarMarks = Record<
  Exclude<PlateSelectionToolbarAction, 'clear'>,
  boolean
>

type RunPlateSelectionToolbarActionOptions = {
  onLink?: (editor: PlateEditor) => void
}

const markByAction = {
  bold: 'bold',
  code: 'code',
  italic: 'italic',
  strike: 'strikethrough',
} as const

const hasLink = (editor: PlateEditor) =>
  Boolean(editor.selection && editor.api.some({ at: editor.selection, match: { type: 'a' } }))

export const getPlateSelectionToolbarMarks = (editor: PlateEditor): PlateSelectionToolbarMarks => {
  const marks = editor.api.marks() as Record<string, unknown> | null
  return {
    bold: Boolean(marks?.bold),
    code: Boolean(marks?.code),
    italic: Boolean(marks?.italic),
    link: hasLink(editor),
    strike: Boolean(marks?.strikethrough),
  }
}

export const runPlateSelectionToolbarAction = (
  editor: PlateEditor,
  action: PlateSelectionToolbarAction,
  { onLink }: RunPlateSelectionToolbarActionOptions = {},
) => {
  if (!editor.selection || !editor.api.isExpanded()) return false
  const mark = markByAction[action as keyof typeof markByAction]
  if (mark) {
    editor.tf.toggleMark(mark)
    return true
  }
  if (action === 'link') {
    if (hasLink(editor)) {
      unwrapLink(editor, { at: editor.selection, split: true })
    } else if (onLink) {
      onLink(editor)
    } else {
      editor.tf.focus()
      triggerFloatingLink(editor, { focused: true })
    }
    return true
  }
  if (action === 'clear') {
    editor.tf.removeMarks(Object.values(markByAction), { at: editor.selection })
    unwrapLink(editor, { at: editor.selection, split: true })
    editor.tf.setNodes({ type: 'p' })
    return true
  }
  return false
}
