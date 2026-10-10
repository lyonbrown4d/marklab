import type { BacklinkReference, UnlinkedMentionReference } from '@/logic/backlinks'
import type { FsSearchResult } from '@/services/fsApi'

export const buildUnlinkedMentions = ({
  backlinks,
  results,
  targetPath,
}: {
  backlinks: BacklinkReference[]
  results: FsSearchResult[]
  targetPath: string
}): UnlinkedMentionReference[] => {
  const explicitLines = new Set(
    backlinks.map((backlink) => `${backlink.sourcePath}\0${backlink.line}`),
  )
  return results.flatMap((result) => {
    const highlight = result.snippet_highlights[0]
    if (
      result.path === targetPath ||
      explicitLines.has(`${result.path}\0${result.line}`) ||
      !highlight ||
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
  const before = text.slice(0, start)
  const after = text.slice(end)
  const wikiOpen = before.lastIndexOf('[[')
  if (wikiOpen > before.lastIndexOf(']]') && after.includes(']]')) return true

  const destinationOpen = before.lastIndexOf('](')
  if (destinationOpen > before.lastIndexOf(')') && after.includes(')')) return true

  const labelOpen = before.lastIndexOf('[')
  if (labelOpen <= before.lastIndexOf(']')) return false
  return /^\][ \t]*(?:\(|\[)/u.test(after)
}
