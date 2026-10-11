import type { Path, TRange } from 'platejs'
import type { PlateEditor } from 'platejs/react'
import type {
  PlateDocumentFindRegexContext,
  PlateDocumentFindTextBlock,
  PlateDocumentFindWorkerMatch,
} from '@/workers/plateDocumentFindWorkerProtocol'

type TextNode = { text: string }
type ElementNode = { children: unknown[] }
type BlockNode = { id: string }
type TextEntry = { node: TextNode; path: Path }

export type PlateDocumentFindOptions = {
  matchCase: boolean
  useRegex: boolean
  wholeWord: boolean
}

export type PlateDocumentFindError = 'invalidRegex'

export type PlateDocumentFindMatch = TRange & {
  regex?: PlateDocumentFindRegexContext
}

export const defaultPlateDocumentFindOptions: PlateDocumentFindOptions = {
  matchCase: false,
  useRegex: false,
  wholeWord: false,
}

const isTextNode = (node: unknown): node is TextNode =>
  Boolean(node && typeof node === 'object' && 'text' in node && typeof node.text === 'string')

const isElementNode = (node: unknown): node is ElementNode =>
  Boolean(node && typeof node === 'object' && 'children' in node && Array.isArray(node.children))

const isBlockNode = (node: unknown): node is BlockNode =>
  Boolean(node && typeof node === 'object' && 'id' in node && typeof node.id === 'string')

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const wordCharacter = '[\\p{L}\\p{N}_]'

const createLiteralMatcher = (query: string, options: PlateDocumentFindOptions) => {
  if (!query) return null
  const source = escapeRegExp(query)
  const boundedSource = options.wholeWord
    ? `(?<!${wordCharacter})(?:${source})(?!${wordCharacter})`
    : source
  try {
    return new RegExp(boundedSource, `gu${options.matchCase ? '' : 'i'}`)
  } catch {
    return null
  }
}

const collectTextEntries = (node: ElementNode, path: Path): TextEntry[] => {
  const entries: TextEntry[] = []
  const visit = (child: unknown, childPath: Path) => {
    if (isTextNode(child)) {
      entries.push({ node: child, path: childPath })
      return
    }
    if (!isElementNode(child)) return
    child.children.forEach((nested, index) => visit(nested, [...childPath, index]))
  }
  node.children.forEach((child, index) => visit(child, [...path, index]))
  return entries
}

const getMatchRange = (entries: TextEntry[], start: number, length: number): TRange | null => {
  let offset = 0
  let anchor: TRange['anchor'] | null = null
  let focus: TRange['focus'] | null = null
  const end = start + length

  for (const entry of entries) {
    const textEnd = offset + entry.node.text.length
    if (!anchor && start < textEnd) {
      anchor = { offset: start - offset, path: entry.path }
    }
    if (!focus && end <= textEnd) {
      focus = { offset: end - offset, path: entry.path }
      break
    }
    offset = textEnd
  }

  return anchor && focus ? { anchor, focus } : null
}

const expandRegexReplacement = (context: PlateDocumentFindRegexContext, template: string) => {
  return template.replace(/\$(\$|&|`|'|<[^>]+>|\d{1,2})/g, (token, marker: string) => {
    if (marker === '$') return '$'
    if (marker === '&') return context.match
    if (marker === '`') return context.prefix
    if (marker === "'") return context.suffix
    if (marker.startsWith('<')) {
      const groupName = marker.slice(1, -1)
      return Object.prototype.hasOwnProperty.call(context.groups, groupName)
        ? (context.groups[groupName] ?? '')
        : token
    }

    const captureIndex = Number(marker)
    if (captureIndex > 0 && captureIndex <= context.captures.length) {
      return context.captures[captureIndex - 1] ?? ''
    }
    if (marker.length === 2) {
      const firstDigit = Number(marker[0])
      if (firstDigit > 0 && firstDigit <= context.captures.length) {
        return `${context.captures[firstDigit - 1] ?? ''}${marker[1]}`
      }
    }
    return token
  })
}

const collectElementMatches = (
  node: ElementNode,
  path: Path,
  matcher: RegExp,
): PlateDocumentFindMatch[] => {
  const entries = collectTextEntries(node, path)
  const text = entries.map(({ node: child }) => child.text).join('')
  const matches: PlateDocumentFindMatch[] = []
  matcher.lastIndex = 0
  for (const result of text.matchAll(matcher)) {
    if (!result[0] || result.index === undefined) continue
    const range = getMatchRange(entries, result.index, result[0].length)
    if (!range) continue
    matches.push(range)
  }
  return matches
}

export const collectPlateDocumentFindMatches = (
  editor: PlateEditor,
  query: string,
  options: PlateDocumentFindOptions = defaultPlateDocumentFindOptions,
) => {
  if (options.useRegex) return []
  const matcher = createLiteralMatcher(query, options)
  if (!matcher) return []
  const matches: PlateDocumentFindMatch[] = []
  const visit = (node: unknown, path: Path) => {
    if (!isElementNode(node)) return
    if (node.children.some(isTextNode)) {
      matches.push(...collectElementMatches(node, path, matcher))
      return
    }
    node.children.forEach((child, index) => visit(child, [...path, index]))
  }
  editor.children.forEach((node, index) => visit(node, [index]))
  return matches
}

export const collectPlateDocumentFindSource = (
  editor: PlateEditor,
): PlateDocumentFindTextBlock[] => {
  const blocks: PlateDocumentFindTextBlock[] = []
  const visit = (node: unknown, path: Path) => {
    if (!isElementNode(node)) return
    if (node.children.some(isTextNode)) {
      blocks.push({
        entries: collectTextEntries(node, path).map(({ node: child, path: entryPath }) => ({
          path: [...entryPath],
          text: child.text,
        })),
      })
      return
    }
    node.children.forEach((child, index) => visit(child, [...path, index]))
  }
  editor.children.forEach((node, index) => visit(node, [index]))
  return blocks
}

export const materializePlateDocumentFindMatches = (
  matches: PlateDocumentFindWorkerMatch[],
): PlateDocumentFindMatch[] => matches

const getReplacement = (match: PlateDocumentFindMatch, template: string) =>
  match.regex ? expandRegexReplacement(match.regex, template) : template

export const replacePlateDocumentFindMatch = (
  editor: PlateEditor,
  match: PlateDocumentFindMatch | undefined,
  replacement: string,
) => {
  if (!match) return false
  editor.tf.withNewBatch(() =>
    editor.tf.insertText(getReplacement(match, replacement), {
      at: { anchor: match.anchor, focus: match.focus },
    }),
  )
  return true
}

export const replaceAllPlateDocumentFindMatches = (
  editor: PlateEditor,
  matches: PlateDocumentFindMatch[],
  replacement: string,
) => {
  if (matches.length === 0) return 0
  editor.tf.withNewBatch(() => {
    editor.tf.withoutNormalizing(() => {
      for (let index = matches.length - 1; index >= 0; index -= 1) {
        const match = matches[index]
        editor.tf.insertText(getReplacement(match, replacement), {
          at: { anchor: match.anchor, focus: match.focus },
        })
      }
    })
  })
  return matches.length
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
  editor.tf.select({ anchor: range.anchor, focus: range.focus })
}
