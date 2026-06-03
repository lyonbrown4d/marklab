import { FileText, ListTree } from 'lucide-react'
import { useMemo } from 'react'
import { CommandGroup, CommandItem, CommandSeparator } from '@/components/ui/command'
import SearchResultPreview from '@/components/SearchResultPreview'
import CommandSearchStatus from '@/components/command/CommandSearchStatus'
import type { FsSearchResult } from '@/services/fsApi'

export type CommandFile = {
  path: string
  label: string
}

export type CommandHeading = {
  path: string
  slug: string
  text: string
  level: number
  label: string
}

type CommandSearchResultsProps = {
  query: string
  files: CommandFile[]
  headings: CommandHeading[]
  fullTextResults: FsSearchResult[]
  fullTextFetching: boolean
  fullTextError: boolean
  workspaceIndexed: boolean
  indexedFileCount: number
  searchIndexRebuilding: boolean
  onOpenFile: (path: string) => void
  onOpenHeading: (path: string, slug: string) => void
  onOpenSearchResult: (result: FsSearchResult) => void
}

const MAX_IDLE_FILE_RESULTS = 8
const MAX_LOCAL_SEARCH_RESULTS = 12

const includesSearch = (value: string, query: string) => value.toLocaleLowerCase().includes(query)

const getHiddenCount = (total: number, visible: number) => Math.max(total - visible, 0)

const renderMoreHint = (count: number) => {
  if (count <= 0) return null

  return (
    <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
      {count} more matches hidden. Keep typing to narrow.
    </div>
  )
}

const CommandSearchResults = ({
  query,
  files,
  headings,
  fullTextResults,
  fullTextFetching,
  fullTextError,
  workspaceIndexed,
  indexedFileCount,
  searchIndexRebuilding,
  onOpenFile,
  onOpenHeading,
  onOpenSearchResult,
}: CommandSearchResultsProps) => {
  const trimmedQuery = query.trim()
  const normalizedQuery = trimmedQuery.toLocaleLowerCase()
  const hasQuery = normalizedQuery.length > 0
  const groupedResults = useMemo(() => {
    if (!hasQuery) {
      return {
        titleMatches: files,
        pathMatches: [],
        headingMatches: [],
      }
    }

    const titleMatches = files.filter((file) => includesSearch(file.label, normalizedQuery))
    const pathMatches = files.filter(
      (file) =>
        !includesSearch(file.label, normalizedQuery) && includesSearch(file.path, normalizedQuery),
    )
    const headingMatches = headings.filter(
      (heading) =>
        includesSearch(heading.text, normalizedQuery) ||
        includesSearch(heading.slug, normalizedQuery) ||
        includesSearch(heading.path, normalizedQuery),
    )

    return {
      titleMatches,
      pathMatches,
      headingMatches,
    }
  }, [files, hasQuery, headings, normalizedQuery])

  const titleLimit = hasQuery ? MAX_LOCAL_SEARCH_RESULTS : MAX_IDLE_FILE_RESULTS
  const visibleTitleMatches = groupedResults.titleMatches.slice(0, titleLimit)
  const visiblePathMatches = groupedResults.pathMatches.slice(0, MAX_LOCAL_SEARCH_RESULTS)
  const visibleHeadingMatches = groupedResults.headingMatches.slice(0, MAX_LOCAL_SEARCH_RESULTS)

  return (
    <>
      <CommandSearchStatus
        query={query}
        fullTextFetching={fullTextFetching}
        fullTextError={fullTextError}
        workspaceIndexed={workspaceIndexed}
        indexedFileCount={indexedFileCount}
        searchIndexRebuilding={searchIndexRebuilding}
      />
      {visibleTitleMatches.length > 0 && (
        <>
          <CommandGroup heading={hasQuery ? 'Title matches' : 'Files'}>
            {visibleTitleMatches.map((file) => (
              <CommandItem
                key={file.path}
                value={`${file.label} ${file.path}`}
                onSelect={() => onOpenFile(file.path)}
              >
                <FileText className="h-4 w-4" />
                <span className="min-w-0">
                  <span className="block truncate">{file.label}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {file.path}
                  </span>
                </span>
              </CommandItem>
            ))}
            {renderMoreHint(getHiddenCount(groupedResults.titleMatches.length, titleLimit))}
          </CommandGroup>
          <CommandSeparator />
        </>
      )}
      {visiblePathMatches.length > 0 && (
        <>
          <CommandGroup heading="Path matches">
            {visiblePathMatches.map((file) => (
              <CommandItem
                key={file.path}
                value={`${file.path} ${file.label}`}
                onSelect={() => onOpenFile(file.path)}
              >
                <FileText className="h-4 w-4" />
                <span className="min-w-0">
                  <span className="block truncate">{file.path}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {file.label}
                  </span>
                </span>
              </CommandItem>
            ))}
            {renderMoreHint(
              getHiddenCount(groupedResults.pathMatches.length, MAX_LOCAL_SEARCH_RESULTS),
            )}
          </CommandGroup>
          <CommandSeparator />
        </>
      )}
      {visibleHeadingMatches.length > 0 && (
        <>
          <CommandGroup heading="Headings">
            {visibleHeadingMatches.map((heading) => (
              <CommandItem
                key={`${heading.path}#${heading.slug}`}
                value={`${heading.text} ${heading.slug} ${heading.path}`}
                onSelect={() => onOpenHeading(heading.path, heading.slug)}
              >
                <ListTree className="h-4 w-4" />
                <span className="min-w-0">
                  <span className="block truncate">
                    {'#'.repeat(Math.min(heading.level, 6))} {heading.text}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {heading.label}#{heading.slug}
                  </span>
                </span>
              </CommandItem>
            ))}
            {renderMoreHint(
              getHiddenCount(groupedResults.headingMatches.length, MAX_LOCAL_SEARCH_RESULTS),
            )}
          </CommandGroup>
          <CommandSeparator />
        </>
      )}
      {fullTextResults.length > 0 && (
        <>
          <CommandGroup heading="Full text">
            {fullTextResults.map((result) => (
              <CommandItem
                key={`${result.path}:${result.line}:${result.column}`}
                value={`${result.title} ${result.path} ${result.snippet}`}
                onSelect={() => onOpenSearchResult(result)}
              >
                <SearchResultPreview result={result} compact />
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
        </>
      )}
    </>
  )
}

export default CommandSearchResults
