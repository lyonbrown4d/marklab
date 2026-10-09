import { X } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { CommandDialogLoadingBody } from '@/components/TitlebarCommandDialogFallback'
import { CommandInput } from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/useI18n'
import { useDeferredOpenContent } from '@/hooks/useDeferredOpenContent'
import type { FsSearchResult } from '@/services/fsApi'
import CommandDialogResultsBody from '@/components/command/CommandDialogResultsBody'
import type {
  CommandNavigationBacklink,
  CommandNavigationMissingLink,
  CommandNavigationOutgoingLink,
} from '@/components/command/CommandNavigationSection'
import type { CommandFile } from '@/components/command/CommandSearchResults'
import { useCommandDialogController } from '@/components/command/useCommandDialogController'
import { useRecentCommands } from '@/components/command/useRecentCommands'
import { builtInMarkdownCollections } from '@/logic/markdownCollections'
import { useWorkspaceNavigationQuery } from '@/components/titlebar/useWorkspaceNavigationQuery'
import type { NavigationLocation } from '@/features/navigation/navigationHistory'
import type { SettingsSelection } from '@/components/settings/settingsRoutes'

type TitlebarCommandDialogProps = {
  open: boolean
  activePath: string | null
  files: CommandFile[]
  recentFiles: CommandFile[]
  recentLocations?: NavigationLocation[]
  onOpenFile: (path: string) => void
  onOpenHeading: (path: string, slug: string) => void
  onOpenSearchResult: (result: FsSearchResult) => void
  onOpenNavigationLocation?: (location: NavigationLocation) => void
  onOpenSettingsSelection?: (selection: SettingsSelection) => void
  onOpenPathInNewWindow?: (path: string) => void
  onOpenNavigationOutgoingLink: (link: CommandNavigationOutgoingLink) => void
  onOpenNavigationBacklink: (backlink: CommandNavigationBacklink) => void
  onOpenNavigationMissingLink: (missingLink: CommandNavigationMissingLink) => void
  onAction: (id: string) => void
  canCreateWorkspaceEntries: boolean
  searchIndexRebuilding: boolean
  workspaceKey: string
  dataReady?: boolean
}

const noop = () => undefined

const TitlebarCommandDialog = ({
  open,
  activePath,
  files,
  recentFiles,
  recentLocations = [],
  onOpenFile,
  onOpenHeading,
  onOpenSearchResult,
  onOpenNavigationLocation = noop,
  onOpenSettingsSelection = noop,
  onOpenPathInNewWindow,
  onOpenNavigationOutgoingLink,
  onOpenNavigationBacklink,
  onOpenNavigationMissingLink,
  onAction,
  canCreateWorkspaceEntries,
  searchIndexRebuilding,
  workspaceKey,
  dataReady = true,
}: TitlebarCommandDialogProps) => {
  const { t } = useI18n()
  const commandContentReady = useDeferredOpenContent(open)
  const contentReady = commandContentReady && dataReady
  const { inputRef, ...controller } = useCommandDialogController({
    contentReady,
    onOpenFile,
    onOpenHeading,
    onOpenPathInNewWindow,
    onOpenSearchResult,
    open,
    workspaceKey,
  })
  const navigationScope =
    controller.deferredParsedSearch.scope === 'text' ? 'all' : controller.deferredParsedSearch.scope
  const navigation = useWorkspaceNavigationQuery({
    activePath,
    enabled: contentReady,
    navigationEnabled: controller.mode === 'quick-open',
    query: controller.deferredTrimmedQuery,
    scope: navigationScope,
    workspaceKey,
  })
  const collections = useMemo(() => {
    const counts: Readonly<Record<string, number>> = navigation.collectionCounts ?? {}
    return builtInMarkdownCollections.map((collection) => ({
      ...collection,
      count: counts[collection.id] ?? 0,
    }))
  }, [navigation.collectionCounts])
  const { recentCommandIds, rememberCommand } = useRecentCommands()
  const handleCommandAction = useCallback(
    (id: string) => {
      rememberCommand(id)
      onAction(id)
    },
    [onAction, rememberCommand],
  )
  const inputPlaceholder =
    controller.mode === 'settings'
      ? t('command.placeholder.settings')
      : controller.mode === 'commands'
        ? t('command.placeholder.commands')
        : controller.mode === 'full-text'
          ? t('command.placeholder.fullText')
          : t('command.placeholder.quickOpen')

  return (
    <>
      <div className="relative m-4 mb-3 rounded-xl border border-primary/55 bg-background shadow-sm shadow-primary/10 focus-within:ring-2 focus-within:ring-primary/20">
        <CommandInput
          ref={inputRef}
          aria-label={inputPlaceholder}
          value={controller.query}
          onValueChange={controller.handleQueryChange}
          onKeyDownCapture={controller.handleInputKeyDown}
          placeholder={inputPlaceholder}
          className="h-14 pr-20 text-[15px] focus-visible:!shadow-none"
        />
        {controller.query && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={t('search.clear')}
            className="absolute right-3 top-1/2 size-8 -translate-y-1/2 rounded-lg text-muted-foreground"
            onClick={controller.clearQuery}
          >
            <X className="size-4" />
          </Button>
        )}
      </div>
      {contentReady ? (
        <CommandDialogResultsBody
          activePath={activePath}
          canCreateWorkspaceEntries={canCreateWorkspaceEntries}
          collections={collections}
          controller={controller}
          files={files}
          navigation={navigation}
          onAction={handleCommandAction}
          onOpenNavigationBacklink={onOpenNavigationBacklink}
          onOpenNavigationLocation={onOpenNavigationLocation}
          onOpenNavigationMissingLink={onOpenNavigationMissingLink}
          onOpenNavigationOutgoingLink={onOpenNavigationOutgoingLink}
          onOpenSettingsSelection={onOpenSettingsSelection}
          recentCommandIds={recentCommandIds}
          recentFiles={recentFiles}
          recentLocations={recentLocations}
          searchIndexRebuilding={searchIndexRebuilding}
        />
      ) : (
        <CommandDialogLoadingBody />
      )}
    </>
  )
}

export default TitlebarCommandDialog
