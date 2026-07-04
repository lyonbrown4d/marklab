import type { editor as MonacoEditor } from 'monaco-editor'

type FocusedCodeEditorAction =
  'edit.undo' | 'edit.redo' | 'edit.cut' | 'edit.copy' | 'edit.paste' | 'edit.select_all'

const codeEditorCommandByAction: Record<FocusedCodeEditorAction, string> = {
  'edit.undo': 'undo',
  'edit.redo': 'redo',
  'edit.cut': 'editor.action.clipboardCutAction',
  'edit.copy': 'editor.action.clipboardCopyAction',
  'edit.paste': 'editor.action.clipboardPasteAction',
  'edit.select_all': 'editor.action.selectAll',
}

let focusedCodeEditor: MonacoEditor.IStandaloneCodeEditor | null = null

export const setFocusedCodeEditor = (editor: MonacoEditor.IStandaloneCodeEditor) => {
  focusedCodeEditor = editor
}

export const clearFocusedCodeEditor = (editor: MonacoEditor.IStandaloneCodeEditor) => {
  if (focusedCodeEditor === editor) focusedCodeEditor = null
}

export const isCodeEditorElement = (element: Element | null) => {
  return Boolean(element?.closest('.monaco-editor'))
}

export const executeFocusedCodeEditorCommand = (action: string) => {
  const command = isFocusedCodeEditorAction(action) ? codeEditorCommandByAction[action] : null
  if (!focusedCodeEditor || !command) return false

  focusedCodeEditor.focus()
  focusedCodeEditor.trigger('marklab.editMenu', command, null)
  return true
}

const isFocusedCodeEditorAction = (action: string): action is FocusedCodeEditorAction => {
  return Object.prototype.hasOwnProperty.call(codeEditorCommandByAction, action)
}
