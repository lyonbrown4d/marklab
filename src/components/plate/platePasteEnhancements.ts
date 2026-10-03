import type { PlateEditor } from 'platejs/react'

const HTTP_URL = /^https?:\/\/\S+$/iu
const WWW_URL = /^www\.\S+\.\S+$/iu
const DISABLED_TYPES = new Set(['code_block', 'codeBlock', 'frontmatter', 'front_matter', 'yaml'])

export const normalizePastedUrl = (value: string) => {
  const text = value.trim()
  if (!text || /\s/u.test(text)) return null
  const candidate = HTTP_URL.test(text) ? text : WWW_URL.test(text) ? `https://${text}` : null
  if (!candidate) return null
  try {
    const url = new URL(candidate)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return null
    }
    return candidate
  } catch {
    return null
  }
}

export const applyPastedUrlToSelection = (editor: PlateEditor, value: string) => {
  if (!editor.selection || !editor.api.isExpanded()) return false
  const href = normalizePastedUrl(value)
  if (!href || hasDisabledAncestor(editor)) return false
  const selectedText = editor.api.string(editor.selection)
  if (!selectedText) return false

  editor.tf.wrapNodes({ type: 'a', url: href, children: [] }, { at: editor.selection, split: true })
  return true
}

export const handlePlatePasteLink = (editor: PlateEditor, event: ClipboardEvent) => {
  if ((event as ClipboardEvent & { isComposing?: boolean }).isComposing || !event.clipboardData) {
    return false
  }
  const handled = applyPastedUrlToSelection(editor, event.clipboardData.getData('text/plain'))
  if (handled) event.preventDefault()
  return handled
}

const hasDisabledAncestor = (editor: PlateEditor) => {
  const path = editor.selection?.focus.path
  if (!path) return true
  for (let depth = 1; depth < path.length; depth += 1) {
    const entry = editor.api.node(path.slice(0, depth))
    const type = entry?.[0] && 'type' in entry[0] ? entry[0].type : null
    if (typeof type === 'string' && DISABLED_TYPES.has(type)) return true
  }
  return false
}
