import type { Path, TRange } from 'platejs'
import type { PlateEditor } from 'platejs/react'

type TextNode = { text: string }
type ElementNode = { children: unknown[] }
type BlockNode = { id: string }

const isTextNode = (node: unknown): node is TextNode =>
  Boolean(node && typeof node === 'object' && 'text' in node && typeof node.text === 'string')

const isElementNode = (node: unknown): node is ElementNode =>
  Boolean(node && typeof node === 'object' && 'children' in node && Array.isArray(node.children))

const isBlockNode = (node: unknown): node is BlockNode =>
  Boolean(node && typeof node === 'object' && 'id' in node && typeof node.id === 'string')

const getMatchRange = (
  texts: TextNode[],
  path: Path,
  start: number,
  length: number,
): TRange | null => {
  let offset = 0
  let anchor: TRange['anchor'] | null = null
  let focus: TRange['focus'] | null = null
  const end = start + length

  for (let index = 0; index < texts.length; index += 1) {
    const textEnd = offset + texts[index].text.length
    if (!anchor && start < textEnd) {
      anchor = { offset: start - offset, path: [...path, index] }
    }
    if (!focus && end <= textEnd) {
      focus = { offset: end - offset, path: [...path, index] }
      break
    }
    offset = textEnd
  }

  return anchor && focus ? { anchor, focus } : null
}

const collectElementMatches = (node: ElementNode, path: Path, query: string) => {
  if (!node.children.every(isTextNode)) return []
  const texts = node.children
  const text = texts
    .map((child) => child.text)
    .join('')
    .toLowerCase()
  const normalizedQuery = query.toLowerCase()
  const matches: TRange[] = []
  let start = 0

  while (start <= text.length - normalizedQuery.length) {
    const matchStart = text.indexOf(normalizedQuery, start)
    if (matchStart < 0) break
    const range = getMatchRange(texts, path, matchStart, query.length)
    if (range) matches.push(range)
    start = matchStart + normalizedQuery.length
  }
  return matches
}

export const collectPlateDocumentFindMatches = (editor: PlateEditor, query: string) => {
  if (!query) return []
  const matches: TRange[] = []
  const visit = (node: unknown, path: Path) => {
    if (!isElementNode(node)) return
    if (node.children.every(isTextNode)) {
      matches.push(...collectElementMatches(node, path, query))
      return
    }
    node.children.forEach((child, index) => visit(child, [...path, index]))
  }
  editor.children.forEach((node, index) => visit(node, [index]))
  return matches
}

export const getPlateDocumentFindInitialQuery = (editor: PlateEditor) => {
  if (!editor.selection || !editor.api.isExpanded()) return ''
  const selectedText = editor.api.string(editor.selection)
  if (!selectedText || selectedText.length > 200 || /[\r\n]/.test(selectedText)) return ''
  return selectedText
}

export const getPlateDocumentFindBlockId = (editor: PlateEditor, range: TRange) => {
  const entry = editor.api.node([range.anchor.path[0]])
  return entry && isBlockNode(entry[0]) ? entry[0].id : null
}

export const selectPlateDocumentFindMatch = (editor: PlateEditor, range: TRange) => {
  editor.tf.select(range)
}
