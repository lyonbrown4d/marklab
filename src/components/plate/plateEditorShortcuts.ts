import { detectPlatform, matchesKeyboardEvent, parseHotkey } from '@tanstack/react-hotkeys'
import { toggleCodeBlock } from '@platejs/code-block'
import { toggleBulletedList, toggleNumberedList } from '@platejs/list-classic'
import { insertTable } from '@platejs/table'
import type { PlateEditor } from 'platejs/react'
import {
  markdownEditorHeadingShortcutLevels,
  markdownEditorShortcutActionIds,
} from '@/components/editor/editorCommandCatalog'
import {
  resolveShortcutBindings,
  type ShortcutActionId,
  type ShortcutBindings,
} from '@/logic/shortcuts'
import { isImeKeyboardEvent } from '@/logic/ime'

type ShortcutOptions = {
  onImageImport?: () => void
  onLinkInsert?: () => void
}

type FormattingShortcutBinding = {
  action: ShortcutActionId
  key: string
  shiftKey: boolean
}

const formattingShortcutBindings = [
  { action: 'editor.bold', key: 'b', shiftKey: false },
  { action: 'editor.italic', key: 'i', shiftKey: false },
  { action: 'editor.inlineCode', key: 'e', shiftKey: false },
  { action: 'editor.strike', key: 'x', shiftKey: true },
  { action: 'editor.link', key: 'k', shiftKey: false },
] as const satisfies readonly FormattingShortcutBinding[]

export const resolvePlateFormattingShortcut = (
  event: KeyboardEvent,
  overrides: ShortcutBindings,
): ShortcutActionId | null => {
  if ((!event.ctrlKey && !event.metaKey) || event.altKey) return null
  const key = event.key.toLowerCase()
  const binding = formattingShortcutBindings.find(
    (candidate) => candidate.key === key && candidate.shiftKey === event.shiftKey,
  )
  if (!binding || Object.hasOwn(overrides, binding.action)) return null
  return binding.action
}

const markByAction: Partial<Record<ShortcutActionId, string>> = {
  'editor.bold': 'bold',
  'editor.inlineCode': 'code',
  'editor.italic': 'italic',
  'editor.strike': 'strikethrough',
}

export const runPlateEditorShortcut = (
  editor: PlateEditor,
  action: ShortcutActionId,
  options: ShortcutOptions = {},
) => {
  const mark = markByAction[action]
  if (mark) {
    editor.tf.toggleMark(mark)
    return true
  }
  const headingLevel = markdownEditorHeadingShortcutLevels[action]
  if (headingLevel) {
    editor.tf.setNodes({ type: `h${headingLevel}` })
    return true
  }
  switch (action) {
    case 'editor.paragraph':
      editor.tf.setNodes({ type: 'p' })
      return true
    case 'editor.codeBlock':
      toggleCodeBlock(editor)
      return true
    case 'editor.quote':
      editor.tf.setNodes({ type: 'blockquote' })
      return true
    case 'editor.bulletList':
      toggleBulletedList(editor)
      return true
    case 'editor.orderedList':
      toggleNumberedList(editor)
      return true
    case 'editor.table':
      insertTable(editor, { colCount: 3, header: true, rowCount: 3 })
      return true
    case 'editor.clearFormat':
      for (const key of Object.values(markByAction)) editor.tf.removeMark(key)
      editor.tf.setNodes({ type: 'p' })
      return true
    case 'editor.link':
      options.onLinkInsert?.()
      return Boolean(options.onLinkInsert)
    case 'editor.image':
      options.onImageImport?.()
      return Boolean(options.onImageImport)
    default:
      return false
  }
}

export const handlePlateEditorBoundaryShortcut = (editor: PlateEditor, event: KeyboardEvent) => {
  if (event.defaultPrevented || isImeKeyboardEvent(event) || event.altKey || event.shiftKey)
    return false
  const moveToStart =
    (event.ctrlKey && event.key === 'Home') || (event.metaKey && event.key === 'ArrowUp')
  const moveToEnd =
    (event.ctrlKey && event.key === 'End') || (event.metaKey && event.key === 'ArrowDown')
  if (!moveToStart && !moveToEnd) return false

  editor.tf.select(moveToStart ? editor.api.start([]) : editor.api.end([]))
  event.preventDefault()
  event.stopPropagation()
  return true
}

export const handlePlateEditorShortcut = (
  editor: PlateEditor,
  event: KeyboardEvent,
  overrides: ShortcutBindings = {},
  options: ShortcutOptions = {},
) => {
  if (event.defaultPrevented || isImeKeyboardEvent(event)) return false
  if (handlePlateEditorBoundaryShortcut(editor, event)) return true
  const platform = detectPlatform()
  const resolved = resolveShortcutBindings(overrides)
  const action =
    resolvePlateFormattingShortcut(event, overrides) ??
    markdownEditorShortcutActionIds.find((actionId) =>
      resolved[actionId].some((hotkey) =>
        matchesKeyboardEvent(event, parseHotkey(hotkey, platform), platform),
      ),
    )
  if (!action || !runPlateEditorShortcut(editor, action, options)) return false
  event.preventDefault()
  event.stopPropagation()
  return true
}
