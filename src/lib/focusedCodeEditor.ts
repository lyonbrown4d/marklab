import type { editor as MonacoEditor, Selection } from 'monaco-editor'
import { inferPlatformFromUserAgent, isTauriRuntime } from '@/runtime/environment'
import { readClipboardText } from '@/runtime/clipboard'
import { rendererDiagnostics } from '@/services/rendererDiagnostics'
import { getVimEditorRoot } from '@/components/vim/vimKeyboardScope'

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
let releasePasteShortcut: (() => void) | undefined
type PasteQueue = { editor: MonacoEditor.IStandaloneCodeEditor; pending: number; running: boolean }
type PasteTarget = { model: MonacoEditor.ITextModel; version: number; selections: Selection[] }
// Queue only request counts; one active read owns the clipboard text buffer.
const maxPendingPastes = 16
let pasteQueue: PasteQueue | null = null

const cancelQueuedPastes = () => {
  if (pasteQueue) pasteQueue.pending = 0
  pasteQueue = null
}

export const setFocusedCodeEditor = (editor: MonacoEditor.IStandaloneCodeEditor) => {
  if (focusedCodeEditor === editor) return
  releasePasteShortcut?.()
  releasePasteShortcut = undefined
  cancelQueuedPastes()
  focusedCodeEditor = editor
  pasteQueue = { editor, pending: 0, running: false }
  if (!isTauriRuntime()) return
  const listener = editor.onKeyDown((event) => {
    const key = event.browserEvent
    if (
      key.defaultPrevented ||
      key.isComposing ||
      key.altKey ||
      key.shiftKey ||
      key.key.toLowerCase() !== 'v' ||
      !editor.hasTextFocus()
    )
      return
    const mac = inferPlatformFromUserAgent() === 'macos'
    if (mac ? !key.metaKey || key.ctrlKey : !key.ctrlKey || key.metaKey) return
    // Ctrl+V belongs to Vim's visual/literal commands; native menu Paste remains available.
    if (!mac && getVimEditorRoot(editor.getDomNode())) return
    event.preventDefault()
    event.stopPropagation()
    executeFocusedCodeEditorCommand('edit.paste')
  })
  releasePasteShortcut = () => listener.dispose()
}

export const clearFocusedCodeEditor = (editor: MonacoEditor.IStandaloneCodeEditor) => {
  if (focusedCodeEditor === editor) {
    focusedCodeEditor = null
    cancelQueuedPastes()
    releasePasteShortcut?.()
    releasePasteShortcut = undefined
  }
}

export const isCodeEditorElement = (element: Element | null) => {
  return Boolean(element?.closest('.monaco-editor'))
}

export const executeFocusedCodeEditorCommand = (action: string) => {
  const command = isFocusedCodeEditorAction(action) ? codeEditorCommandByAction[action] : null
  if (!focusedCodeEditor || !command) return false

  focusedCodeEditor.focus()
  if (action === 'edit.paste' && isTauriRuntime()) {
    const queue = pasteQueue
    if (!queue || queue.pending >= maxPendingPastes) return true
    queue.pending += 1
    if (!queue.running) {
      queue.running = true
      void drainNativePastes(queue)
    }
    return true
  }
  focusedCodeEditor.trigger('marklab.editMenu', command, null)
  return true
}

const drainNativePastes = async (queue: PasteQueue) => {
  try {
    let target = capturePasteTarget(queue.editor)
    while (pasteQueue === queue && queue.pending > 0) {
      if (!target || !isPasteTargetCurrent(queue, target)) {
        queue.pending = 0
        return
      }
      target = await pasteNativeClipboard(queue, target)
      if (!target) {
        queue.pending = 0
        return
      }
      queue.pending = Math.max(0, queue.pending - 1)
    }
  } catch (error: unknown) {
    queue.pending = 0
    rendererDiagnostics.warn('editor.clipboard', 'source-paste-failed', error)
  } finally {
    queue.running = false
  }
}

const capturePasteTarget = (editor: MonacoEditor.IStandaloneCodeEditor): PasteTarget | null => {
  const model = editor.getModel()
  const selections = editor.getSelections()
  if (!model || model.isDisposed() || !selections || editor.getRawOptions().readOnly) return null
  return { model, selections, version: model.getVersionId() }
}

const pasteNativeClipboard = async (queue: PasteQueue, target: PasteTarget) => {
  const text = await readClipboardText()
  if (!isPasteTargetCurrent(queue, target)) return null
  if (text) queue.editor.trigger('marklab.editMenu', 'paste', { text })
  // Continue from this paste's result, never a later cursor/document change.
  const next = capturePasteTarget(queue.editor)
  return next?.model === target.model ? next : null
}

const isPasteTargetCurrent = (queue: PasteQueue, target: PasteTarget) => {
  const { editor } = queue
  const { model, version, selections } = target
  const currentSelections = editor.getSelections()
  return Boolean(
    pasteQueue === queue &&
    focusedCodeEditor === editor &&
    document.hasFocus() &&
    editor.hasTextFocus() &&
    editor.getModel() === model &&
    !model.isDisposed() &&
    model.getVersionId() === version &&
    !editor.getRawOptions().readOnly &&
    currentSelections &&
    selections.length === currentSelections.length &&
    selections.every((selection, index) => selection.equalsSelection(currentSelections[index])),
  )
}

const isFocusedCodeEditorAction = (action: string): action is FocusedCodeEditorAction => {
  return Object.prototype.hasOwnProperty.call(codeEditorCommandByAction, action)
}
