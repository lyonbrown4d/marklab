import { X } from 'lucide-react'
import { useMemo } from 'react'
import { CommandDialogLoadingBody } from '@/components/TitlebarCommandDialogFallback'
import { CommandEmpty, CommandInput, CommandList } from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/useI18n'
import { useDeferredOpenContent } from '@/hooks/useDeferredOpenContent'
import type { FsSearchResult } from '@/services/fsApi'
import CommandActionSections from '@/components/command/CommandActionSections'
import CommandDialogFooter from '@/components/command/CommandDialogFooter'
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
import { useCommandDialogController } from '@/components/command/useCommandDialogController'
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
  workspaceKey: string
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
  workspaceKey,
  dataReady = true,
}: TitlebarCommandDialogProps) => {
  const { t } = useI18n()
  const commandContentReady = useDeferredOpenContent(open)
  const contentReady = commandContentReady && dataReady
  const controller = useCommandDialogController({
    contentReady,
    onOpenFile,
    onOpenHeading,
    onOpenSearchResult,
    open,
    workspaceKey,
  })
  const {
    clearQuery,
    clearSearchHistory,
    deferredParsedSearch,
    deferredQuery,
    deferredTrimmedQuery,
    fullTextSearch,
    handleInputKeyDown,
    handleQueryChange,
    handleSelectMode,
    handleSelectQuery,
    inputRef,
    mode,
    parsedSearch,
    query,
    rememberAndOpenFile,
    rememberAndOpenHeading,
    rememberAndOpenSearchResult,
    returnToQuickOpen,
    searches,
    searching,
    trimmedQuery,
  } = controller
  const fullTextResults = fullTextSearch.fullTextResults
  const emptyQueryLabel =
    mode === 'commands'
      ? t('command.emptyTitle.commands')
      : mode === 'full-text'
        ? t('command.emptyTitle.fullText')
        : t('command.emptyTitle.quickOpen')
  const emptyDescription =
    mode === 'commands'
      ? t('command.empty.commands')
      : mode === 'full-text'
        ? t(trimmedQuery ? 'command.empty.text' : 'command.empty.fullTextPrompt')
        : parsedSearch.scope === 'files'
          ? t('command.empty.files')
          : parsedSearch.scope === 'headings'
            ? t('command.empty.headings')
            : t(trimmedQuery ? 'command.empty.quickOpen' : 'command.empty.quickOpenPrompt')
  const emptyScopeSuggestions = useMemo(
    () =>
      mode !== 'quick-open'
        ? []
        : [
            { marker: '@', label: t('command.search.scopeFiles'), value: '@ ' },
            { marker: '#', label: t('command.search.scopeHeadings'), value: '# ' },
          ],
    [mode, t],
  )
  const inputPlaceholder =
    mode === 'commands'
      ? t('command.placeholder.commands')
      : mode === 'full-text'
        ? t('command.placeholder.fullText')
        : t('command.placeholder.quickOpen')
  const suppressEmptyState =
    mode === 'full-text' && (fullTextSearch.fullTextFetching || fullTextSearch.fullTextError)

  return (
    <>
      <div className="relative m-4 mb-3 rounded-xl border border-primary/55 bg-background shadow-sm shadow-primary/10 focus-within:ring-2 focus-within:ring-primary/20">
        <CommandInput
          ref={inputRef}
          aria-label={inputPlaceholder}
          value={query}
          onValueChange={handleQueryChange}
          onKeyDown={handleInputKeyDown}
          placeholder={inputPlaceholder}
          className="h-14 pr-20 text-[15px] focus-visible:!shadow-none"
        />
        {query && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={t('search.clear')}
            className="absolute right-3 top-1/2 size-8 -translate-y-1/2 rounded-lg text-muted-foreground"
            onClick={clearQuery}
          >
            <X className="size-4" />
          </Button>
        )}
      </div>
      {contentReady ? (
        <>
          <CommandSearchOverview mode={mode} onSelectMode={handleSelectMode} />
          <div
            role="tabpanel"
            id="command-mode-results"
            aria-labelledby={`command-mode-tab-${mode}`}
          >
            <CommandList className="mt-2 min-h-[260px] max-h-[min(56vh,520px)] scroll-py-2 px-2 pb-2">
              <CommandEmpty>
                {!suppressEmptyState && (
                  <CommandEmptyState
                    title={emptyQueryLabel}
                    description={emptyDescription}
                    suggestions={emptyScopeSuggestions}
                    onSelectScope={handleSelectQuery}
                  />
                )}
              </CommandEmpty>
              {!searching && mode === 'quick-open' && (
                <CommandSearchHistory
                  query={query}
                  searches={searches}
                  onSelectSearch={handleSelectQuery}
                  onClearSearches={clearSearchHistory}
                />
              )}
              {!searching && mode === 'quick-open' && (
                <CommandRecentFilesSection
                  files={recentFiles}
                  query={deferredTrimmedQuery}
                  onOpenFile={rememberAndOpenFile}
                />
              )}
              {mode === 'quick-open' && parsedSearch.scope === 'all' && (
                <CommandNavigationSection
                  activePath={activePath}
                  headings={navigationHeadings}
                  outgoingLinks={navigationOutgoingLinks}
                  backlinks={navigationBacklinks}
                  missingLinks={navigationMissingLinks}
                  onOpenHeading={rememberAndOpenHeading}
                  onOpenOutgoingLink={onOpenNavigationOutgoingLink}
                  onOpenBacklink={onOpenNavigationBacklink}
                  onOpenMissingLink={onOpenNavigationMissingLink}
                />
              )}
              {mode === 'quick-open' && searching && (
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
                  includeFullText={false}
                  onOpenFile={rememberAndOpenFile}
                  onOpenHeading={rememberAndOpenHeading}
                  onOpenSearchResult={rememberAndOpenSearchResult}
                />
              )}
              {mode === 'full-text' && (
                <CommandSearchResults
                  query={deferredQuery}
                  scope="text"
                  files={[]}
                  headings={[]}
                  fullTextResults={fullTextResults}
                  fullTextFetching={fullTextSearch.fullTextFetching}
                  fullTextError={fullTextSearch.fullTextError}
                  workspaceIndexed={workspaceIndexed}
                  indexedFileCount={indexedFileCount}
                  searchIndexRebuilding={searchIndexRebuilding}
                  onOpenFile={rememberAndOpenFile}
                  onOpenHeading={rememberAndOpenHeading}
                  onOpenSearchResult={rememberAndOpenSearchResult}
                />
              )}
              {mode === 'commands' && (
                <CommandActionSections
                  canCreateWorkspaceEntries={canCreateWorkspaceEntries}
                  collections={collections}
                  searchIndexRebuilding={searchIndexRebuilding}
                  onCommandPaletteAction={returnToQuickOpen}
                  onAction={onAction}
                />
              )}
            </CommandList>
          </div>
          <CommandDialogFooter />
        </>
      ) : (
        <CommandDialogLoadingBody />
      )}
    </>
  )
}

export default TitlebarCommandDialog
