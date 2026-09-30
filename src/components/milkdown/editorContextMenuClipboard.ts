import type { EditorView } from '@milkdown/kit/prose/view'
import { readClipboardText } from '@/runtime/clipboard'

type ClipboardTextReader = () => Promise<string>

export const pasteTextFromClipboard = async (
  view: EditorView,
  readText: ClipboardTextReader = readClipboardText,
): Promise<boolean> => {
  try {
    const text = await readText()
    if (view.isDestroyed) return false
    view.focus()
    return view.pasteText(text)
  } catch {
    return false
  }
}
