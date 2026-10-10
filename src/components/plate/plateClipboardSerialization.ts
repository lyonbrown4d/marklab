import type { TElement, Value } from 'platejs'
import type { PlateEditor } from 'platejs/react'
import { serializePlateMarkdown } from '@/components/plate/plateMarkdownSerialization'

export type PlateClipboardContent = {
  html?: string
  markdown: string
  text: string
}

export const hasExpandedPlateSelection = (editor: PlateEditor): boolean => {
  const selection = editor.selection
  if (!selection) return false
  if (selection.anchor.offset !== selection.focus.offset) return true
  if (selection.anchor.path.length !== selection.focus.path.length) return true
  return selection.anchor.path.some((segment, index) => segment !== selection.focus.path[index])
}

export const serializePlateSelectionMarkdown = (editor: PlateEditor): string | null => {
  if (!hasExpandedPlateSelection(editor)) return null
  const fragment = editor.api.getFragment() as Value
  if (fragment.length === 0) return null
  return serializePlateMarkdown(editor, fragment).replace(/\n$/, '')
}

export const serializeDomSelectionHtml = (selection: Selection | null): string | undefined => {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return undefined
  const anchor = selection.anchorNode
  const anchorElement = anchor instanceof Element ? anchor : anchor?.parentElement
  const editorRoot = anchorElement?.closest('.markdown-editor')
  if (!editorRoot) return undefined
  const range = selection.getRangeAt(0)
  const container = document.createElement('div')
  container.append(range.cloneContents())
  const commonElement =
    range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement
  if (
    commonElement &&
    commonElement !== editorRoot &&
    commonElement.matches('a, code, del, em, s, strong')
  ) {
    const wrapper = commonElement.cloneNode(false) as Element
    wrapper.append(...container.childNodes)
    container.append(wrapper)
  }
  return container.innerHTML || undefined
}

export const serializePlateSelectionClipboard = (
  editor: PlateEditor,
  selection: Selection | null = typeof window === 'undefined' ? null : window.getSelection(),
): PlateClipboardContent | null => {
  const text = serializePlateSelectionMarkdown(editor)
  if (text === null || !editor.selection) return null
  return {
    html: serializeDomSelectionHtml(selection),
    markdown: text,
    text: editor.api.string(editor.selection),
  }
}

export const serializePlateBlockClipboard = (
  editor: PlateEditor,
  element: TElement,
): PlateClipboardContent => {
  const markdown = serializePlateMarkdown(editor, [element]).replace(/\n$/, '')
  let html: string | undefined
  try {
    html = editor.api.toDOMNode(element)?.outerHTML || undefined
  } catch {
    html = undefined
  }
  return { html, markdown, text: editor.api.string(element) }
}
