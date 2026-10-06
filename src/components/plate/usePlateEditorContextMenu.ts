import { useMemo } from 'react'
import type { PlateEditor } from 'platejs/react'
import type {
  EditorContextMenuAction,
  EditorContextMenuAdapter,
  EditorContextMenuCapabilities,
} from '@/components/EditorContextMenu'
import { readClipboardText } from '@/runtime/clipboard'
import { queueFocusedEditCommand } from '@/runtime/editCommands'

type UsePlateEditorContextMenuOptions = {
  getEditor: () => PlateEditor | null
  onLinkInsert?: () => void
  readOnly?: boolean
}

const hasExpandedSelection = (editor: PlateEditor) => {
  const selection = editor.selection
  if (!selection) return false
  return (
    selection.anchor.offset !== selection.focus.offset ||
    selection.anchor.path.some((segment, index) => segment !== selection.focus.path[index])
  )
}

const disabledCapabilities: EditorContextMenuCapabilities = {
  bold: false,
  copy: false,
  cut: false,
  inlineCode: false,
  italic: false,
  link: false,
  paste: false,
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
  const hasSelection = hasExpandedSelection(editor)
  return {
    bold: !readOnly,
    copy: hasSelection,
    cut: !readOnly && hasSelection,
    inlineCode: !readOnly,
    italic: !readOnly,
    link: !readOnly,
    paste: !readOnly,
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

const runAction = (
  editor: PlateEditor | null,
  action: EditorContextMenuAction,
  readOnly: boolean,
  onLinkInsert?: () => void,
) => {
  if (!editor || (readOnly && action !== 'copy' && action !== 'selectAll')) return
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
    void readClipboardText().then((text) => {
      if (text) editor.tf.insertText(text)
    })
    return
  }
  if (action === 'copy' || action === 'cut') queueFocusedEditCommand(action)
}

export const usePlateEditorContextMenu = ({
  getEditor,
  onLinkInsert,
  readOnly = false,
}: UsePlateEditorContextMenuOptions): EditorContextMenuAdapter =>
  useMemo(
    () => ({
      getCapabilities: () => getCapabilities(getEditor(), readOnly),
      onAction: (action) => runAction(getEditor(), action, readOnly, onLinkInsert),
    }),
    [getEditor, onLinkInsert, readOnly],
  )
