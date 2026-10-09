import type { NavigationLocation } from '@/features/navigation/navigationHistory'
import type { SettingsSelection } from '@/components/settings/settingsRoutes'
import type { MarkdownCollectionSummary } from '@/logic/markdownCollections'
import type { ReturnTypeOfUseCommandDialogController } from '@/components/command/useCommandDialogController'
import type { useWorkspaceNavigationQuery } from '@/components/titlebar/useWorkspaceNavigationQuery'
import type { CommandFile } from '@/components/command/CommandSearchResults'
import CommandActionSections from '@/components/command/CommandActionSections'
import CommandAnalysisState from '@/components/command/CommandAnalysisState'
import CommandDialogFooter from '@/components/command/CommandDialogFooter'
import CommandEmptyState from '@/components/command/CommandEmptyState'
import CommandNavigationSection, {
  type CommandNavigationBacklink,
  type CommandNavigationMissingLink,
  type CommandNavigationOutgoingLink,
} from '@/components/command/CommandNavigationSection'
import CommandRecentFilesSection from '@/components/command/CommandRecentFilesSection'
import CommandRecentLocationsSection from '@/components/command/CommandRecentLocationsSection'
import CommandSearchHistory from '@/components/command/CommandSearchHistory'
import CommandSearchOverview from '@/components/command/CommandSearchOverview'
import CommandSearchResults from '@/components/command/CommandSearchResults'
import CommandSettingsSection from '@/components/command/CommandSettingsSection'
import { CommandEmpty, CommandList } from '@/components/ui/command'
import { useI18n } from '@/i18n/useI18n'

type CommandDialogResultsBodyProps = {
  activePath: string | null
  canCreateWorkspaceEntries: boolean
  collections: MarkdownCollectionSummary[]
  controller: ReturnTypeOfUseCommandDialogController
  files: CommandFile[]
  navigation: ReturnType<typeof useWorkspaceNavigationQuery>
  onAction: (id: string) => void
  onOpenNavigationBacklink: (backlink: CommandNavigationBacklink) => void
  onOpenNavigationLocation: (location: NavigationLocation) => void
  onOpenNavigationMissingLink: (missingLink: CommandNavigationMissingLink) => void
  onOpenNavigationOutgoingLink: (link: CommandNavigationOutgoingLink) => void
  onOpenSettingsSelection: (selection: SettingsSelection) => void
  recentCommandIds: readonly string[]
  recentFiles: CommandFile[]
  recentLocations: NavigationLocation[]
  searchIndexRebuilding: boolean
}

const CommandDialogResultsBody = ({
  activePath,
  canCreateWorkspaceEntries,
  collections,
  controller,
  files,
  navigation,
  onAction,
  onOpenNavigationBacklink,
  onOpenNavigationLocation,
  onOpenNavigationMissingLink,
  onOpenNavigationOutgoingLink,
  onOpenSettingsSelection,
  recentCommandIds,
  recentFiles,
  recentLocations,
  searchIndexRebuilding,
}: CommandDialogResultsBodyProps) => {
  const { t } = useI18n()
  const {
    clearSearchHistory,
    deferredParsedSearch,
    deferredQuery,
    deferredTrimmedQuery,
    fullTextSearch,
    handleSelectMode,
    handleSelectQuery,
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
  const emptyQueryLabel =
    mode === 'settings'
      ? t('command.emptyTitle.settings')
      : mode === 'commands'
        ? t('command.emptyTitle.commands')
        : mode === 'full-text'
          ? t('command.emptyTitle.fullText')
          : t('command.emptyTitle.quickOpen')
  const emptyDescription =
    mode === 'settings'
      ? t(trimmedQuery ? 'command.empty.settings' : 'command.empty.settingsPrompt')
      : mode === 'commands'
        ? t('command.empty.commands')
        : mode === 'full-text'
          ? t(trimmedQuery ? 'command.empty.text' : 'command.empty.fullTextPrompt')
          : parsedSearch.scope === 'files'
            ? t('command.empty.files')
            : parsedSearch.scope === 'headings'
              ? t('command.empty.headings')
              : t(trimmedQuery ? 'command.empty.quickOpen' : 'command.empty.quickOpenPrompt')
  const emptyScopeSuggestions =
    mode === 'quick-open'
      ? [
          { marker: '@', label: t('command.search.scopeFiles'), value: '@ ' },
          { marker: '#', label: t('command.search.scopeHeadings'), value: '# ' },
        ]
      : []
  const suppressEmptyState =
    mode === 'full-text' && (fullTextSearch.fullTextFetching || fullTextSearch.fullTextError)

  return (
    <>
      <CommandSearchOverview mode={mode} onSelectMode={handleSelectMode} />
      <div role="tabpanel" id="command-mode-results" aria-labelledby={`command-mode-tab-${mode}`}>
        <CommandList className="mt-2 min-h-[260px] max-h-[min(56vh,520px)] scroll-py-2 px-2 pb-2">
          <CommandAnalysisState
            error={navigation.error}
            loading={navigation.loading}
            onRetry={navigation.retry}
          />
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
          {!searching && mode === 'quick-open' && (
            <CommandRecentLocationsSection
              locations={recentLocations}
              onOpen={onOpenNavigationLocation}
            />
          )}
          {mode === 'quick-open' && parsedSearch.scope === 'all' && (
            <CommandNavigationSection
              activePath={activePath}
              headings={navigation.navigationHeadings}
              outgoingLinks={navigation.navigationOutgoingLinks}
              backlinks={navigation.navigationBacklinks}
              missingLinks={navigation.navigationMissingLinks}
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
              headings={navigation.headings}
              fullTextResults={fullTextSearch.fullTextResults}
              fullTextFetching={fullTextSearch.fullTextFetching}
              fullTextError={fullTextSearch.fullTextError}
              workspaceIndexed={navigation.workspaceIndexed}
              indexedFileCount={navigation.indexedFileCount}
              searchIndexRebuilding={searchIndexRebuilding}
              includeFullText={false}
              onOpenFile={rememberAndOpenFile}
              onOpenHeading={rememberAndOpenHeading}
              onOpenSearchResult={rememberAndOpenSearchResult}
            />
          )}
          {mode === 'settings' && (
            <CommandSettingsSection query={deferredTrimmedQuery} onOpen={onOpenSettingsSelection} />
          )}
          {mode === 'full-text' && (
            <CommandSearchResults
              query={deferredQuery}
              scope="text"
              files={[]}
              headings={[]}
              fullTextResults={fullTextSearch.fullTextResults}
              fullTextFetching={fullTextSearch.fullTextFetching}
              fullTextError={fullTextSearch.fullTextError}
              workspaceIndexed={navigation.workspaceIndexed}
              indexedFileCount={navigation.indexedFileCount}
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
              query={query}
              recentCommandIds={recentCommandIds}
              onCommandPaletteAction={returnToQuickOpen}
              onAction={onAction}
            />
          )}
        </CommandList>
      </div>
      <CommandDialogFooter />
    </>
  )
}

export default CommandDialogResultsBody
