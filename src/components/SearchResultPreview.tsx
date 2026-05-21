import { FileSearch, Search } from 'lucide-react'
import type { ReactNode } from 'react'
import type { FsSearchResult } from '@/services/fsApi'

type SearchResultPreviewProps = {
  result: FsSearchResult
  compact?: boolean
}

type HighlightRange = {
  start: number
  end: number
}

const HighlightText = ({ text, ranges }: { text: string; ranges: HighlightRange[] }) => {
  if (!text || ranges.length === 0) return <>{text}</>

  const chars = Array.from(text)
  const normalized = ranges
    .map((range) => ({
      start: Math.max(0, Math.min(range.start, chars.length)),
      end: Math.max(0, Math.min(range.end, chars.length)),
    }))
    .filter((range) => range.start < range.end)
    .sort((first, second) => first.start - second.start)

  if (normalized.length === 0) return <>{text}</>

  const parts: ReactNode[] = []
  let cursor = 0
  normalized.forEach((range, index) => {
    if (range.start > cursor) {
      parts.push(<span key={`text-${index}`}>{chars.slice(cursor, range.start).join('')}</span>)
    }
    parts.push(
      <mark
        key={`mark-${index}`}
        className="rounded-sm bg-primary/20 px-0.5 text-foreground ring-1 ring-primary/20"
      >
        {chars.slice(range.start, range.end).join('')}
      </mark>,
    )
    cursor = Math.max(cursor, range.end)
  })
  if (cursor < chars.length) {
    parts.push(<span key="tail">{chars.slice(cursor).join('')}</span>)
  }

  return <>{parts}</>
}

const SearchResultPreview = ({ result, compact = false }: SearchResultPreviewProps) => {
  const Icon = compact ? Search : FileSearch
  return (
    <>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{result.title}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {result.path}:{result.line}
        </span>
        {result.snippet && (
          <span
            className={
              compact
                ? 'mt-0.5 block truncate text-[11px] text-muted-foreground/90'
                : 'mt-0.5 block whitespace-normal text-[11px] leading-4 text-muted-foreground/90'
            }
          >
            <HighlightText text={result.snippet} ranges={result.snippet_highlights} />
          </span>
        )}
      </span>
    </>
  )
}

export default SearchResultPreview
