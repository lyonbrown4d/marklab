import { all, createLowlight } from 'lowlight'

export const MAX_SOURCE_HIGHLIGHT_CHARACTERS = 40_000
export const MAX_SOURCE_HIGHLIGHT_LINES = 400

export type SourceHighlightFragment = {
  classNames: readonly string[]
  text: string
}

export type SourceHighlightLine = readonly SourceHighlightFragment[]

type HighlightNode = {
  children?: readonly HighlightNode[]
  properties?: { className?: unknown }
  type?: unknown
  value?: unknown
}

const sourceLowlight = createLowlight(all)
const safeTokenClassPattern = /^hljs-[a-z0-9_-]+$/i

const tokenClasses = (node: HighlightNode): readonly string[] => {
  const value = node.properties?.className
  if (!Array.isArray(value)) return []
  return value.filter(
    (className): className is string =>
      typeof className === 'string' && safeTokenClassPattern.test(className),
  )
}

const flattenTokens = (
  node: HighlightNode,
  inheritedClasses: readonly string[],
  fragments: SourceHighlightFragment[],
) => {
  if (node.type === 'text' && typeof node.value === 'string') {
    fragments.push({ classNames: inheritedClasses, text: node.value })
    return
  }

  const classNames = [...inheritedClasses, ...tokenClasses(node)]
  node.children?.forEach((child) => flattenTokens(child, classNames, fragments))
}

const splitFragmentsIntoLines = (
  fragments: readonly SourceHighlightFragment[],
): SourceHighlightLine[] => {
  const lines: SourceHighlightFragment[][] = [[]]
  for (const fragment of fragments) {
    const parts = fragment.text.split('\n')
    parts.forEach((part, index) => {
      if (part) lines.at(-1)?.push({ ...fragment, text: part })
      if (index < parts.length - 1) lines.push([])
    })
  }
  return lines
}

const highlightableLineCount = (lines: readonly string[]) => {
  let characters = 0
  let count = 0
  while (count < Math.min(lines.length, MAX_SOURCE_HIGHLIGHT_LINES)) {
    const lineLength = (lines[count]?.length ?? 0) + (count > 0 ? 1 : 0)
    if (characters + lineLength > MAX_SOURCE_HIGHLIGHT_CHARACTERS) break
    characters += lineLength
    count += 1
  }
  return count
}

const plainLine = (text: string): SourceHighlightLine => [{ classNames: [], text }]

export const highlightSourceLines = (
  lines: readonly string[],
  languageId: string,
): SourceHighlightLine[] => {
  const lineCount = highlightableLineCount(lines)
  if (languageId === 'plaintext' || !sourceLowlight.registered(languageId) || lineCount === 0) {
    return lines.map(plainLine)
  }

  try {
    const root = sourceLowlight.highlight(languageId, lines.slice(0, lineCount).join('\n'))
    const fragments: SourceHighlightFragment[] = []
    flattenTokens(root as HighlightNode, [], fragments)
    const highlighted = splitFragmentsIntoLines(fragments)
    return [...highlighted, ...lines.slice(lineCount).map(plainLine)]
  } catch {
    return lines.map(plainLine)
  }
}
