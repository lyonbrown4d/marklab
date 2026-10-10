import type { TRange } from 'platejs'
import type { PlateEditor } from 'platejs/react'
import { buildPlateInlineCompletionContext } from '@/components/plate/completion/plateInlineCompletionContext'
import type { MarkdownLanguageCodeAction } from '@/services/markdownLanguageApi'

export type PlateWorkspaceLinkItem = {
  action?: MarkdownLanguageCodeAction
  detail?: string
  insertText: string
  kind: 'create-file' | 'file' | 'heading' | 'replace-anchor'
  label: string
  replacementLength: number
}

export type PlateWorkspaceLinkTrigger = {
  anchor: TRange['anchor']
  closeLink: boolean
  focus: TRange['focus']
  query: string
}

export const plateWorkspaceLinkQuery = ({ before }: { before: string }): string | null => {
  const start = before.lastIndexOf('[[')
  if (start < 0) return null
  const query = before.slice(start + 2)
  return query.includes(']]') || query.includes('|') || /[\r\n]/u.test(query) ? null : query
}

export const getPlateWorkspaceLinkTrigger = (
  editor: PlateEditor,
): PlateWorkspaceLinkTrigger | null => {
  const context = buildPlateInlineCompletionContext(editor, {
    characterBudget: 2_000,
    nearbyBlockLimit: 0,
  })
  if (!context || !editor.selection) return null

  const query = plateWorkspaceLinkQuery(context)
  if (query == null) return null
  const anchor = editor.api.before(editor.selection.focus, {
    distance: query.length,
    unit: 'character',
  })
  if (!anchor) return null
  return {
    anchor,
    closeLink: !context.after.startsWith(']]'),
    focus: { ...editor.selection.focus },
    query,
  }
}

export const applyPlateWorkspaceLinkItem = (
  editor: PlateEditor,
  trigger: PlateWorkspaceLinkTrigger,
  item: PlateWorkspaceLinkItem,
): boolean => {
  const replacementStart = editor.api.before(trigger.focus, {
    distance: item.replacementLength,
    unit: 'character',
  })
  if (!replacementStart) return false

  editor.tf.withNewBatch(() => {
    editor.tf.select({ anchor: replacementStart, focus: trigger.focus })
    editor.tf.insertText(`${item.insertText}${trigger.closeLink ? ']]' : ''}`)
  })
  return true
}

export const isSamePlateWorkspaceLinkTrigger = (
  left: PlateWorkspaceLinkTrigger | null,
  right: PlateWorkspaceLinkTrigger | null,
): boolean => {
  if (!left || !right) return left === right
  return (
    left.query === right.query &&
    left.anchor.offset === right.anchor.offset &&
    left.focus.offset === right.focus.offset &&
    left.anchor.path.every((part, index) => part === right.anchor.path[index]) &&
    left.focus.path.every((part, index) => part === right.focus.path[index])
  )
}
