import type { BacklinkReference, UnlinkedMentionReference } from '@/logic/backlinks'
import type { FsSearchResult } from '@/services/fsApi'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'

const parser = unified().use(remarkParse)

export const buildUnlinkedMentions = ({
  backlinks,
  results,
  targetPath,
}: {
  backlinks: BacklinkReference[]
  results: FsSearchResult[]
  targetPath: string
}): UnlinkedMentionReference[] => {
  const explicitLineContexts = new Map<string, string>()
  for (const backlink of backlinks) {
    if (backlink.context) {
      explicitLineContexts.set(`${backlink.sourcePath}\0${backlink.line}`, backlink.context)
    }
  }
  return results.flatMap((result) => {
    const highlight = result.snippet_highlights[0]
    const lineContext = explicitLineContexts.get(`${result.path}\0${result.line}`)
    if (
      result.path === targetPath ||
      !highlight ||
      (lineContext && isMarkdownLinkMatch(lineContext, result.column - 1, result.end_column - 1)) ||
      isMarkdownLinkMatch(result.snippet, highlight.start, highlight.end)
    ) {
      return []
    }
    return [
      {
        sourcePath: result.path,
        text: result.snippet.slice(highlight.start, highlight.end),
        context: result.snippet,
        line: result.line,
        column: result.column,
        endColumn: result.end_column,
      },
    ]
  })
}

const isMarkdownLinkMatch = (text: string, start: number, end: number): boolean => {
  const overlaps = (from: number, to: number) => start < to && end > from
  let linked = false
  visit(parser.parse(text), (node) => {
    if (!['link', 'linkReference', 'image', 'imageReference', 'definition'].includes(node.type)) {
      return
    }
    const from = node.position?.start.offset
    const to = node.position?.end.offset
    if (from !== undefined && to !== undefined && overlaps(from, to)) linked = true
  })
  if (linked) return true

  // A search snippet omits reference definitions elsewhere in the document.
  const explicitSyntax = /(?<!\\)(?:\[\[[^\]\n]+\]\]|\[[^\]\n]+\][ \t]*\[[^\]\n]*\])/gu
  return Array.from(text.matchAll(explicitSyntax)).some((match) =>
    overlaps(match.index, match.index + match[0].length),
  )
}
