import { useEffect, useMemo } from 'react'
import type { PlateEditor } from 'platejs/react'
import type {
  EditorContextMenuAction,
  EditorContextMenuAdapter,
  EditorContextMenuCapabilities,
} from '@/components/EditorContextMenu'
import {
  hasExpandedPlateSelection,
  serializePlateSelectionClipboard,
  serializePlateSelectionMarkdown,
  type PlateClipboardContent,
} from '@/components/plate/plateClipboardSerialization'
import { readClipboardText, writeClipboardContent, writeClipboardText } from '@/runtime/clipboard'
import { queueFocusedEditCommand } from '@/runtime/editCommands'
import { isElectronRuntime } from '@/runtime/electron'

type UsePlateEditorContextMenuOptions = {
  getEditor: () => PlateEditor | null
  onLinkInsert?: () => void
  readOnly?: boolean
}

const disabledCapabilities: EditorContextMenuCapabilities = {
  bold: false,
  copy: false,
  copyAsMarkdown: false,
  cut: false,
  inlineCode: false,
  italic: false,
  link: false,
  paste: false,
  pasteAsPlainText: false,
  redo: false,
  selectAll: false,
  strike: false,
  undo: false,
}

const getCapabilities = (
  editor: PlateEditor | null,
  readOnly: boolean,
): EditorContextMenuCapabilities => {
  if (!editor) return disabledCapabilities
  const hasSelection = hasExpandedPlateSelection(editor)
  return {
    bold: !readOnly,
    copy: hasSelection,
    copyAsMarkdown: hasSelection,
    cut: !readOnly && hasSelection,
    inlineCode: !readOnly,
    italic: !readOnly,
    link: !readOnly,
    paste: !readOnly,
    pasteAsPlainText: !readOnly,
    redo: !readOnly && editor.history.redos.length > 0,
    selectAll: true,
    strike: !readOnly,
    undo: !readOnly && editor.history.undos.length > 0,
  }
}

const markByAction: Partial<Record<EditorContextMenuAction, string>> = {
  bold: 'bold',
  inlineCode: 'code',
  italic: 'italic',
  strike: 'strikethrough',
}

const writeClipboardEvent = (event: ClipboardEvent, content: PlateClipboardContent): void => {
  if (!event.clipboardData) return
  event.preventDefault()
  event.clipboardData.setData('text/plain', content.text)
  if (content.html) event.clipboardData.setData('text/html', content.html)
  try {
    event.clipboardData.setData('text/markdown', content.markdown)
  } catch {
    // Chromium support for custom clipboard MIME types varies by platform.
  }
}

const handleClipboardEvent = (
  editor: PlateEditor,
  event: ClipboardEvent,
  readOnly: boolean,
): void => {
  if (event.type === 'cut' && readOnly) {
    event.preventDefault()
    return
  }
  const content = serializePlateSelectionClipboard(editor)
  if (!content) return
  writeClipboardEvent(event, content)
  if (isElectronRuntime()) void writeClipboardContent(content).catch(() => undefined)
  if (event.defaultPrevented && event.type === 'cut') editor.tf.deleteFragment()
}

const runAction = (
  editor: PlateEditor | null,
  action: EditorContextMenuAction,
  readOnly: boolean,
  onLinkInsert?: () => void,
) => {
  if (
    !editor ||
    (readOnly && action !== 'copy' && action !== 'copyAsMarkdown' && action !== 'selectAll')
  )
    return
  const mark = markByAction[action]
  if (mark) {
    editor.tf.toggleMark(mark)
    return
  }
  if (action === 'undo' || action === 'redo') {
    editor.tf[action]()
    return
  }
  if (action === 'selectAll') {
    editor.tf.selectAll()
    return
  }
  if (action === 'link') {
    onLinkInsert?.()
    return
  }
  if (action === 'paste') {
    queueFocusedEditCommand('paste')
    return
  }
  if (action === 'pasteAsPlainText') {
    void readClipboardText()
      .then((text) => {
        if (text) editor.tf.insertText(text)
      })
      .catch(() => undefined)
    return
  }
  if (action === 'copyAsMarkdown') {
    const markdown = serializePlateSelectionMarkdown(editor)
    if (markdown !== null) void writeClipboardText(markdown).catch(() => undefined)
    return
  }
  if (action === 'copy') {
    const content = serializePlateSelectionClipboard(editor)
    if (!content) return
    void writeClipboardContent(content).catch(() => queueFocusedEditCommand('copy'))
    return
  }
  if (action === 'cut') {
    const content = serializePlateSelectionClipboard(editor)
    const selection = editor.selection
    if (!content || !selection) return
    void writeClipboardContent(content)
      .then(() => editor.tf.delete({ at: selection }))
      .catch(() => queueFocusedEditCommand('cut'))
  }
}

const isPlateClipboardTarget = (editor: PlateEditor, target: EventTarget | null): boolean => {
  const root = editor.api.toDOMNode(editor)
  if (!root) return false
  if (target instanceof Node && root.contains(target)) return true
  const anchor = window.getSelection()?.anchorNode
  return anchor instanceof Node && root.contains(anchor)
}

export const usePlateEditorContextMenu = ({
  getEditor,
  onLinkInsert,
  readOnly = false,
}: UsePlateEditorContextMenuOptions): EditorContextMenuAdapter => {
  useEffect(() => {
    const handleEvent = (event: ClipboardEvent) => {
      const editor = getEditor()
      if (!editor) return
      try {
        if (!isPlateClipboardTarget(editor, event.target)) return
        handleClipboardEvent(editor, event, readOnly)
      } catch {
        // Leave the event untouched so the browser's native clipboard path remains available.
      }
    }
    document.addEventListener('copy', handleEvent, true)
    document.addEventListener('cut', handleEvent, true)
    return () => {
      document.removeEventListener('copy', handleEvent, true)
      document.removeEventListener('cut', handleEvent, true)
    }
  }, [getEditor, readOnly])

  return useMemo(
    () => ({
      getCapabilities: () => getCapabilities(getEditor(), readOnly),
      onAction: (action) => runAction(getEditor(), action, readOnly, onLinkInsert),
    }),
    [getEditor, onLinkInsert, readOnly],
  )
}
