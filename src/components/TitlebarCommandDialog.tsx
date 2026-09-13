import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { CommandDialogLoadingBody } from '@/components/TitlebarCommandDialogFallback'
import { CommandEmpty, CommandInput, CommandList } from '@/components/ui/command'
import { useI18n } from '@/i18n/useI18n'
import { useDeferredOpenContent } from '@/hooks/useDeferredOpenContent'
import type { FsSearchResult } from '@/services/fsApi'
import CommandActionSections from '@/components/command/CommandActionSections'
import CommandEmptyState from '@/components/command/CommandEmptyState'
import CommandNavigationSection, {
  type CommandNavigationBacklink,
  type CommandNavigationHeading,
  type CommandNavigationMissingLink,
  type CommandNavigationOutgoingLink,
} from '@/components/command/CommandNavigationSection'
import CommandRecentFilesSection from '@/components/command/CommandRecentFilesSection'
import CommandSearchOverview from '@/components/command/CommandSearchOverview'
import CommandSearchHistory from '@/components/command/CommandSearchHistory'
import CommandSearchResults, {
  type CommandFile,
  type CommandHeading,
} from '@/components/command/CommandSearchResults'
import { parseCommandSearchScope } from '@/components/command/commandSearchScope'
import { useCommandSearchHistory } from '@/components/command/useCommandSearchHistory'
import { useCommandFullTextSearchStream } from '@/components/command/useCommandFullTextSearchStream'
import type { WorkspaceKnowledgeSummary } from '@/logic/knowledge'
import type { MarkdownCollectionSummary } from '@/logic/markdownCollections'

type TitlebarCommandDialogProps = {
  open: boolean
  activePath: string | null
  files: CommandFile[]
  recentFiles: CommandFile[]
  headings: CommandHeading[]
  navigationHeadings: CommandNavigationHeading[]
  navigationOutgoingLinks: CommandNavigationOutgoingLink[]
  navigationBacklinks: CommandNavigationBacklink[]
  navigationMissingLinks: CommandNavigationMissingLink[]
  onOpenFile: (path: string) => void
  onOpenHeading: (path: string, slug: string) => void
  onOpenSearchResult: (result: FsSearchResult) => void
  onOpenNavigationOutgoingLink: (link: CommandNavigationOutgoingLink) => void
  onOpenNavigationBacklink: (backlink: CommandNavigationBacklink) => void
  onOpenNavigationMissingLink: (missingLink: CommandNavigationMissingLink) => void
  onAction: (id: string) => void
  canCreateWorkspaceEntries: boolean
  workspaceIndexed: boolean
  indexedFileCount: number
  searchIndexRebuilding: boolean
  knowledgeSummary: WorkspaceKnowledgeSummary
  collections: MarkdownCollectionSummary[]
  dataReady?: boolean
}

const TitlebarCommandDialog = ({
  open,
  activePath,
  files,
  recentFiles,
  headings,
  navigationHeadings,
  navigationOutgoingLinks,
  navigationBacklinks,
  navigationMissingLinks,
  onOpenFile,
  onOpenHeading,
  onOpenSearchResult,
  onOpenNavigationOutgoingLink,
  onOpenNavigationBacklink,
  onOpenNavigationMissingLink,
  onAction,
  canCreateWorkspaceEntries,
  workspaceIndexed,
  indexedFileCount,
  searchIndexRebuilding,
  collections,
  dataReady = true,
}: TitlebarCommandDialogProps) => {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [actionsOnly, setActionsOnly] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!open) return
    // The dialog shell may already be open when its lazy content arrives.
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [open])
  const commandContentReady = useDeferredOpenContent(open)
  const contentReady = commandContentReady && dataReady
  const deferredQuery = useDeferredValue(query)
  const parsedSearch = useMemo(() => parseCommandSearchScope(query), [query])
  const deferredParsedSearch = useMemo(
    () => parseCommandSearchScope(deferredQuery),
    [deferredQuery],
  )
  const trimmedQuery = parsedSearch.query
  const deferredTrimmedQuery = deferredParsedSearch.query
  const searching = trimmedQuery.length > 0 || parsedSearch.scope !== 'all'
  const { searches, rememberSearch, clearSearchHistory } = useCommandSearchHistory()
  const fullTextSearch = useCommandFullTextSearchStream({
    limit: 8,
    open: contentReady && !actionsOnly && deferredTrimmedQuery.length >= 2,
    query: deferredTrimmedQuery,
    scope: deferredParsedSearch.scope,
  })
  const fullTextResults = fullTextSearch.fullTextResults
  const emptyQueryLabel =
    trimmedQuery.length > 0
      ? t('command.noResultsFor', { query: trimmedQuery })
      : t('command.noResults')
  const emptyDescription =
    trimmedQuery.length === 0
      ? t('command.searchHint')
      : parsedSearch.scope === 'files'
        ? t('command.empty.files')
        : parsedSearch.scope === 'headings'
          ? t('command.empty.headings')
          : parsedSearch.scope === 'text'
            ? t('command.empty.text')
            : t('command.empty.all')
  const emptyScopeSuggestions = useMemo(
    () => [
      { marker: '@', label: t('command.search.scopeFiles'), value: '@ ' },
      { marker: '#', label: t('command.search.scopeHeadings'), value: '# ' },
      { marker: '?', label: t('command.search.scopeText'), value: '? ' },
    ],
    [t],
  )
  const handleOpenFile = useCallback(
    (path: string) => {
      rememberSearch(deferredTrimmedQuery)
      onOpenFile(path)
    },
    [deferredTrimmedQuery, onOpenFile, rememberSearch],
  )
  const handleOpenHeading = useCallback(
    (path: string, slug: string) => {
      rememberSearch(deferredTrimmedQuery)
      onOpenHeading(path, slug)
    },
    [deferredTrimmedQuery, onOpenHeading, rememberSearch],
  )
  const handleOpenSearchResult = useCallback(
    (result: FsSearchResult) => {
      rememberSearch(deferredTrimmedQuery)
      onOpenSearchResult(result)
    },
    [deferredTrimmedQuery, onOpenSearchResult, rememberSearch],
  )
  const handleSelectQuery = useCallback((nextQuery: string) => {
    setActionsOnly(false)
    setQuery(nextQuery)
    inputRef.current?.focus()
  }, [])

  const handleCommandPaletteAction = useCallback(() => {
    handleSelectQuery('')
  }, [handleSelectQuery])

  const handleToggleActions = useCallback(() => {
    setActionsOnly((current) => !current)
    setQuery('')
    inputRef.current?.focus()
  }, [])

  return (
    <>
      <CommandInput
        ref={inputRef}
        value={query}
        onValueChange={setQuery}
        placeholder={t('sidebar.search')}
      />
      {contentReady ? (
        <>
          <CommandSearchOverview
            actionsOnly={actionsOnly}
            onSelectScope={handleSelectQuery}
            onToggleActions={handleToggleActions}
          />
          <CommandList>
            <CommandEmpty>
              <CommandEmptyState
                title={emptyQueryLabel}
                description={emptyDescription}
                suggestions={emptyScopeSuggestions}
                onSelectScope={handleSelectQuery}
              />
            </CommandEmpty>
            {!searching && !actionsOnly && (
              <CommandSearchHistory
                query={query}
                searches={searches}
                onSelectSearch={handleSelectQuery}
                onClearSearches={clearSearchHistory}
              />
            )}
            {!searching && !actionsOnly && (
              <CommandRecentFilesSection
                files={recentFiles}
                query={deferredTrimmedQuery}
                onOpenFile={handleOpenFile}
              />
            )}
            {actionsOnly && (
              <CommandNavigationSection
                activePath={activePath}
                headings={navigationHeadings}
                outgoingLinks={navigationOutgoingLinks}
                backlinks={navigationBacklinks}
                missingLinks={navigationMissingLinks}
                onOpenHeading={handleOpenHeading}
                onOpenOutgoingLink={onOpenNavigationOutgoingLink}
                onOpenBacklink={onOpenNavigationBacklink}
                onOpenMissingLink={onOpenNavigationMissingLink}
              />
            )}
            {searching && !actionsOnly && (
              <CommandSearchResults
                query={deferredQuery}
                scope={deferredParsedSearch.scope}
                files={files}
                headings={headings}
                fullTextResults={fullTextResults}
                fullTextFetching={fullTextSearch.fullTextFetching}
                fullTextError={fullTextSearch.fullTextError}
                workspaceIndexed={workspaceIndexed}
                indexedFileCount={indexedFileCount}
                searchIndexRebuilding={searchIndexRebuilding}
                onOpenFile={handleOpenFile}
                onOpenHeading={handleOpenHeading}
                onOpenSearchResult={handleOpenSearchResult}
              />
            )}
            {(actionsOnly || (searching && parsedSearch.scope === 'all')) && (
              <CommandActionSections
                canCreateWorkspaceEntries={canCreateWorkspaceEntries}
                collections={collections}
                searchIndexRebuilding={searchIndexRebuilding}
                onCommandPaletteAction={handleCommandPaletteAction}
                onAction={onAction}
              />
            )}
          </CommandList>
        </>
      ) : (
        <CommandDialogLoadingBody />
      )}
    </>
  )
}

export default TitlebarCommandDialog
