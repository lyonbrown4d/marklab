import { ElementApi, type TElement, type TRange } from 'platejs'
import type { PlateEditor } from 'platejs/react'
import type { ShortcutActionId } from '@/logic/shortcuts'
import { serializePlateSelectionMarkdown } from '@/components/plate/plateClipboardSerialization'
import { runPlateEditorShortcut } from '@/components/plate/plateEditorShortcuts'
import { writeClipboardText } from '@/runtime/clipboard'

export const plateSelectionToolbarMoreActions = [
  'paragraph',
  'heading1',
  'heading2',
  'heading3',
  'quote',
  'bulletList',
  'orderedList',
  'copyMarkdown',
  'ai',
] as const

export type PlateSelectionToolbarMoreAction = (typeof plateSelectionToolbarMoreActions)[number]

type RunMoreActionOptions = {
  onAi?: () => void
  onError?: (error: unknown) => void
  writeText?: (text: string) => Promise<void>
}

const shortcutByAction: Partial<Record<PlateSelectionToolbarMoreAction, ShortcutActionId>> = {
  bulletList: 'editor.bulletList',
  heading1: 'editor.heading1',
  heading2: 'editor.heading2',
  heading3: 'editor.heading3',
  orderedList: 'editor.orderedList',
  paragraph: 'editor.paragraph',
}

const quoteChildCount = (node: TElement) => (node.type === 'blockquote' ? node.children.length : 1)

const mapPointIntoQuote = (
  point: TRange['anchor'],
  selectedBlocks: TElement[],
  startIndex: number,
) => {
  const relativeIndex = point.path[0]! - startIndex
  const childOffset = selectedBlocks
    .slice(0, relativeIndex)
    .reduce((total, node) => total + quoteChildCount(node), 0)
  const source = selectedBlocks[relativeIndex]!
  if (source.type === 'blockquote') {
    return {
      offset: point.offset,
      path: [startIndex, childOffset + (point.path[1] ?? 0), ...point.path.slice(2)],
    }
  }
  return {
    offset: point.offset,
    path: [startIndex, childOffset, ...point.path.slice(1)],
  }
}

const wrapSelectionInQuote = (editor: PlateEditor) => {
  const selection = editor.selection
  if (!selection) return false
  const startIndex = Math.min(selection.anchor.path[0]!, selection.focus.path[0]!)
  const endIndex = Math.max(selection.anchor.path[0]!, selection.focus.path[0]!)
  const selectedBlocks = structuredClone(editor.children.slice(startIndex, endIndex + 1))
  if (!selectedBlocks.every(ElementApi.isElement)) return false
  if (selectedBlocks.length === 1 && selectedBlocks[0]!.type === 'blockquote') {
    editor.tf.focus()
    return true
  }
  const nextSelection = {
    anchor: mapPointIntoQuote(selection.anchor, selectedBlocks, startIndex),
    focus: mapPointIntoQuote(selection.focus, selectedBlocks, startIndex),
  }
  const children = selectedBlocks.flatMap((node) =>
    node.type === 'blockquote' ? node.children : [node],
  )

  editor.tf.withNewBatch(() => {
    editor.tf.withoutNormalizing(() => {
      for (let index = endIndex; index >= startIndex; index -= 1) {
        editor.tf.removeNodes({ at: [index] })
      }
      editor.tf.insertNodes({ children, type: 'blockquote' }, { at: [startIndex] })
      editor.tf.select(nextSelection)
    })
  })
  editor.tf.focus()
  return true
}

export const runPlateSelectionToolbarMoreAction = (
  editor: PlateEditor,
  action: PlateSelectionToolbarMoreAction,
  { onAi, onError, writeText = writeClipboardText }: RunMoreActionOptions = {},
) => {
  if (!editor.selection || !editor.api.isExpanded()) return false

  if (action === 'quote') return wrapSelectionInQuote(editor)

  const shortcut = shortcutByAction[action]
  if (shortcut) return runPlateEditorShortcut(editor, shortcut)

  if (action === 'copyMarkdown') {
    const markdown = serializePlateSelectionMarkdown(editor)
    if (markdown === null) return false
    void writeText(markdown).catch((error: unknown) => onError?.(error))
    return true
  }

  if (action === 'ai' && onAi) {
    onAi()
    return true
  }

  return false
}
