import { useMemo, type RefObject } from 'react'
import type { editor as MonacoEditor } from 'monaco-editor'
import type {
  EditorContextMenuAction,
  EditorContextMenuAdapter,
  EditorContextMenuCapabilities,
} from '@/components/EditorContextMenu'
import { sourceEditorActionId } from '@/components/markdownSourceShortcuts'
import type { MarkdownSourceFormatAction } from '@/components/markdownSourceFormatting'

const formatActionByMenuAction: Partial<
  Record<EditorContextMenuAction, MarkdownSourceFormatAction>
> = {
  bold: 'editor.bold',
  inlineCode: 'editor.inlineCode',
  italic: 'editor.italic',
  link: 'editor.link',
  strike: 'editor.strike',
}

const editorCommandByMenuAction: Partial<Record<EditorContextMenuAction, string>> = {
  copy: 'editor.action.clipboardCopyAction',
  cut: 'editor.action.clipboardCutAction',
  paste: 'editor.action.clipboardPasteAction',
  redo: 'redo',
  selectAll: 'editor.action.selectAll',
  undo: 'undo',
}

export const useSourceCodeContextMenu = (
  editorRef: RefObject<MonacoEditor.IStandaloneCodeEditor | null>,
  readOnly = false,
): EditorContextMenuAdapter =>
  useMemo(
    () => ({
      getCapabilities: () => getSourceCapabilities(editorRef.current, readOnly),
      onAction: (action: EditorContextMenuAction) => {
        if (readOnly && action !== 'copy' && action !== 'selectAll') return
        const editor = editorRef.current
        if (!editor) return
        const formatAction = formatActionByMenuAction[action]
        const command = formatAction
          ? sourceEditorActionId(formatAction)
          : editorCommandByMenuAction[action]
        if (!command) return
        editor.focus()
        editor.trigger('marklab.editorContextMenu', command, null)
      },
    }),
    [editorRef, readOnly],
  )

const getSourceCapabilities = (
  editor: MonacoEditor.IStandaloneCodeEditor | null,
  readOnly: boolean,
): EditorContextMenuCapabilities => {
  const model = editor?.getModel()
  if (!editor || !model) {
    return Object.fromEntries(
      Object.keys({ ...formatActionByMenuAction, ...editorCommandByMenuAction }).map((action) => [
        action,
        false,
      ]),
    )
  }
  const hasSelection = !editor.getSelection()?.isEmpty()
  return {
    copy: hasSelection,
    cut: !readOnly && hasSelection,
    link: !readOnly,
    paste: !readOnly,
    redo: !readOnly && (model.canRedo?.() ?? true),
    undo: !readOnly && (model.canUndo?.() ?? true),
    bold: !readOnly,
    inlineCode: !readOnly,
    italic: !readOnly,
    selectAll: true,
    strike: !readOnly,
  }
}
