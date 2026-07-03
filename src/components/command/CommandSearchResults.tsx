import Fuse from 'fuse.js'
import { Fragment, useDeferredValue, useMemo } from 'react'
import { CommandGroup, CommandSeparator } from '@/components/ui/command'
import CommandSearchStatus from '@/components/command/CommandSearchStatus'
import { useI18n } from '@/i18n/useI18n'
import {
  CommandResultRowItem,
  toFileRows,
  toFullTextRows,
  toHeadingRows,
  type CommandResultRow,
} from '@/components/command/CommandSearchResultRows'
import type { CommandSearchScope } from '@/components/command/commandSearchScope'
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
  scope: CommandSearchScope
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

const FILE_SEARCH_OPTIONS = {
  includeMatches: true,
  includeScore: true,
  ignoreLocation: true,
  threshold: 0.35,
  keys: [
    { name: 'label', weight: 0.7 },
    { name: 'path', weight: 0.3 },
  ],
}

const HEADING_SEARCH_OPTIONS = {
  includeScore: true,
  ignoreLocation: true,
  threshold: 0.35,
  keys: [
    { name: 'text', weight: 0.55 },
    { name: 'slug', weight: 0.2 },
    { name: 'path', weight: 0.2 },
    { name: 'label', weight: 0.05 },
  ],
}

type FuseResultWithMatches<T> = {
  item: T
  matches?: ReadonlyArray<{
    key?: string
  }>
}

type LocalSearchGroups = {
  titleMatches: CommandFile[]
  pathMatches: CommandFile[]
  headingMatches: CommandHeading[]
}

type CommandResultSection = {
  id: string
  heading: string
  totalCount: number
  rows: CommandResultRow[]
}

const getHiddenCount = (total: number, visible: number) => Math.max(total - visible, 0)

const resultMatchesKey = <T,>(result: FuseResultWithMatches<T>, key: string) =>
  result.matches?.some((match) => match.key === key) ?? false

const groupFileSearchResults = (
  results: ReadonlyArray<FuseResultWithMatches<CommandFile>>,
): Pick<LocalSearchGroups, 'titleMatches' | 'pathMatches'> => {
  const titleMatches: CommandFile[] = []
  const pathMatches: CommandFile[] = []

  for (const result of results) {
    if (resultMatchesKey(result, 'label') || !resultMatchesKey(result, 'path')) {
      titleMatches.push(result.item)
      continue
    }

    pathMatches.push(result.item)
  }

  return {
    titleMatches,
    pathMatches,
  }
}

const renderMoreHint = (count: number, label: string) => {
  if (count <= 0) return null

  return (
    <div className="mx-2 mb-1 rounded-md bg-muted/45 px-2 py-1.5 text-[11px] text-muted-foreground">
      {label}
    </div>
  )
}

const CommandSearchResults = ({
  query,
  scope,
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
  const { t } = useI18n()
  const trimmedQuery = query.trim().replace(/^[@#?]\s*/, '')
  const deferredTrimmedQuery = useDeferredValue(trimmedQuery)
  const hasQuery = trimmedQuery.length > 0
  const hasDeferredQuery = deferredTrimmedQuery.length > 0
  const showFiles = scope === 'all' || scope === 'files'
  const showHeadings = scope === 'all' || scope === 'headings'
  const showFullText = scope === 'all' || scope === 'text'
  const fileFuse = useMemo(() => new Fuse(files, FILE_SEARCH_OPTIONS), [files])
  const headingFuse = useMemo(() => new Fuse(headings, HEADING_SEARCH_OPTIONS), [headings])
  const groupedResults = useMemo<LocalSearchGroups>(() => {
    if (!hasQuery) {
      return {
        titleMatches: files,
        pathMatches: [],
        headingMatches: [],
      }
    }

    if (!hasDeferredQuery) {
      return {
        titleMatches: [],
        pathMatches: [],
        headingMatches: [],
      }
    }

    const { titleMatches, pathMatches } = groupFileSearchResults(
      fileFuse.search(deferredTrimmedQuery),
    )
    const headingMatches = headingFuse.search(deferredTrimmedQuery).map((result) => result.item)

    return {
      titleMatches,
      pathMatches,
      headingMatches,
    }
  }, [deferredTrimmedQuery, fileFuse, files, hasDeferredQuery, hasQuery, headingFuse])

  const resultSections = useMemo<CommandResultSection[]>(() => {
    const sections: CommandResultSection[] = []
    const titleLimit = hasQuery ? MAX_LOCAL_SEARCH_RESULTS : MAX_IDLE_FILE_RESULTS
    const titleRows = toFileRows(groupedResults.titleMatches.slice(0, titleLimit), 'title-file')
    const pathRows = toFileRows(
      groupedResults.pathMatches.slice(0, MAX_LOCAL_SEARCH_RESULTS),
      'path-file',
    )
    const headingRows = toHeadingRows(
      groupedResults.headingMatches.slice(0, MAX_LOCAL_SEARCH_RESULTS),
    )
    const fullTextRows = toFullTextRows(fullTextResults)

    if (showFiles && titleRows.length > 0) {
      sections.push({
        id: 'title-files',
        heading: hasQuery ? t('command.search.titleMatches') : t('command.files'),
        totalCount: groupedResults.titleMatches.length,
        rows: titleRows,
      })
    }

    if (showFiles && pathRows.length > 0) {
      sections.push({
        id: 'path-files',
        heading: t('command.search.pathMatches'),
        totalCount: groupedResults.pathMatches.length,
        rows: pathRows,
      })
    }

    if (showHeadings && headingRows.length > 0) {
      sections.push({
        id: 'headings',
        heading: t('command.headings'),
        totalCount: groupedResults.headingMatches.length,
        rows: headingRows,
      })
    }

    if (showFullText && fullTextRows.length > 0) {
      sections.push({
        id: 'full-text',
        heading: t('search.fullText'),
        totalCount: fullTextRows.length,
        rows: fullTextRows,
      })
    }

    return sections
  }, [fullTextResults, groupedResults, hasQuery, showFiles, showFullText, showHeadings, t])

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
      {resultSections.map((section) => {
        const hiddenCount = getHiddenCount(section.totalCount, section.rows.length)

        return (
          <Fragment key={section.id}>
            <CommandGroup heading={section.heading}>
              {section.rows.map((row) => (
                <CommandResultRowItem
                  key={row.id}
                  row={row}
                  onOpenFile={onOpenFile}
                  onOpenHeading={onOpenHeading}
                  onOpenSearchResult={onOpenSearchResult}
                />
              ))}
              {renderMoreHint(
                hiddenCount,
                t('command.search.moreHidden', {
                  count: hiddenCount,
                }),
              )}
            </CommandGroup>
            <CommandSeparator />
          </Fragment>
        )
      })}
    </>
  )
}

export default CommandSearchResults
