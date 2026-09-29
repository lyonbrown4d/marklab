import {
  forwardRef,
  lazy,
  memo,
  Suspense,
  useCallback,
  useImperativeHandle,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import WindowControls from '@/components/WindowControls'
import AppCommandDialog from '@/components/AppCommandDialog'
import TitlebarCommandDialogFallback from '@/components/TitlebarCommandDialogFallback'
import { isDesktopRuntime } from '@/runtime/window'
import type { TitlebarProps } from '@/components/titlebar/titlebarTypes'
import { useTitlebarCommandModel } from '@/components/titlebar/useTitlebarCommandModel'
import {
  navigationBacklinkToSearchResult,
  navigationMissingLinkToSearchResult,
} from '@/components/titlebar/titlebarCommandNavigation'
import { useTitlebarPlatform } from '@/components/titlebar/useTitlebarPlatform'
import { cn } from '@/lib/utils'
import { useI18n } from '@/i18n/useI18n'
import { ImmersiveTitlebarChrome } from '@/components/ImmersiveTitlebarChrome'

const TitlebarCommandDialog = lazy(() => import('@/components/TitlebarCommandDialog'))

export type TitlebarHandle = {
  openCommandPalette: () => void
}

const Titlebar = forwardRef<TitlebarHandle, TitlebarProps>(
  (
    {
      activePath,
      tabs,
      dirtyPaths,
      saveStates,
      onToggleSidebar,
      onToggleRightSidebar,
      onSelectProject,
      onSelectSingleFile,
      onCreateFile,
      onCreateFolder,
      onOpenFile,
      onOpenHeading,
      onOpenSearchResult,
      onOpenWorkspaceGraph,
      onOpenAllPages,
      onCloseActiveTab,
      onOpenTerminal,
      onRebuildSearchIndex,
      onChangeView,
      files,
      workspaceIndex,
      canCreateWorkspaceEntries,
      searchIndexRebuilding,
      isMaximized,
      setIsMaximized,
      setTheme,
      commandOpen: controlledCommandOpen,
      onCommandOpenChange,
      onOpenSettings,
    },
    ref,
  ) => {
    const [internalCommandOpen, setInternalCommandOpen] = useState(false)
    const { t } = useI18n()
    const commandOpen = controlledCommandOpen ?? internalCommandOpen
    const commandDataReady = commandOpen
    const setCommandOpen = useCallback(
      (open: boolean) => {
        if (controlledCommandOpen === undefined) {
          setInternalCommandOpen(open)
        }
        onCommandOpenChange?.(open)
      },
      [controlledCommandOpen, onCommandOpenChange],
    )

    useImperativeHandle(
      ref,
      () => ({
        openCommandPalette: () => setCommandOpen(true),
      }),
      [setCommandOpen],
    )

    const { platform, getAppWindow, isWindows, isMacDesktop } = useTitlebarPlatform()
    const {
      commandFiles,
      commandHeadings,
      commandNavigationHeadings,
      commandNavigationOutgoingLinks,
      commandNavigationBacklinks,
      commandNavigationMissingLinks,
      commandRecentFiles,
      commandCollections,
      workspaceKnowledgeSummary,
      onOpenSearch,
      onCommandAction,
      onCommandOpenFile,
      onCommandOpenHeading,
      onCommandOpenSearchResult,
    } = useTitlebarCommandModel({
      activePath,
      files,
      tabs,
      workspaceIndex,
      canCreateWorkspaceEntries,
      onCommandOpenChange: setCommandOpen,
      onChangeView,
      onSelectProject,
      onSelectSingleFile,
      onCreateFile,
      onCreateFolder,
      onCloseActiveTab,
      onToggleSidebar,
      onToggleRightSidebar,
      onOpenSettings,
      onOpenWorkspaceGraph,
      onOpenAllPages,
      onOpenTerminal,
      onRebuildSearchIndex,
      onOpenFile,
      onOpenHeading,
      onOpenSearchResult,
      setTheme,
      platform,
      commandOpen: commandDataReady,
    })

    const handleTitlebarMouseDown = useCallback(
      (e: ReactMouseEvent) => {
        if (!isDesktopRuntime() || platform !== 'macos') return
        if (e.button !== 0) return
        const target = e.target as HTMLElement
        if (
          target.closest(
            'button, a, input, select, textarea, [role="button"], [role="menuitem"], [data-no-drag]',
          )
        )
          return
        void getAppWindow().then((windowHandle) => windowHandle?.startDragging())
      },
      [getAppWindow, platform],
    )
    const activeSaveStatus = activePath
      ? (saveStates[activePath]?.status ?? (dirtyPaths[activePath] ? 'unsaved' : 'saved'))
      : 'saved'

    return (
      <header
        className={cn(
          'app-titlebar relative flex h-14 items-center justify-between border-b border-border/60 px-2.5',
          isMacDesktop && 'pl-[76px]',
        )}
        onMouseDown={handleTitlebarMouseDown}
      >
        <ImmersiveTitlebarChrome
          activePath={activePath}
          saveStatus={activeSaveStatus}
          searchLabel={t('sidebar.search')}
          savedLabel={t('titlebar.savedLocal')}
          savingLabel={t('titlebar.savingLocal')}
          unsavedLabel={t('titlebar.unsavedLocal')}
          saveErrorLabel={t('save.error')}
          localLibraryLabel={t('titlebar.localLibrary')}
          untitledLabel={t('titlebar.untitled')}
          toggleSidebarLabel={t('actions.toggleSidebar')}
          toggleOutlineLabel={t('titlebar.documentOutline')}
          settingsLabel={t('menu.settings')}
          onOpenSearch={onOpenSearch}
          onToggleSidebar={onToggleSidebar}
          onToggleOutline={onToggleRightSidebar}
          onOpenSettings={onOpenSettings}
        />
        {commandOpen && (
          <AppCommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
            <Suspense fallback={<TitlebarCommandDialogFallback />}>
              <TitlebarCommandDialog
                open={commandOpen}
                dataReady={commandDataReady}
                activePath={activePath}
                files={commandFiles}
                recentFiles={commandRecentFiles}
                headings={commandHeadings}
                navigationHeadings={commandNavigationHeadings}
                navigationOutgoingLinks={commandNavigationOutgoingLinks}
                navigationBacklinks={commandNavigationBacklinks}
                navigationMissingLinks={commandNavigationMissingLinks}
                collections={commandCollections}
                onOpenFile={onCommandOpenFile}
                onOpenHeading={onCommandOpenHeading}
                onOpenSearchResult={onCommandOpenSearchResult}
                onOpenNavigationOutgoingLink={(link) => {
                  if (link.targetHeadingSlug) {
                    onCommandOpenHeading(link.targetPath, link.targetHeadingSlug)
                    return
                  }
                  onCommandOpenFile(link.targetPath)
                }}
                onOpenNavigationBacklink={(backlink) =>
                  onCommandOpenSearchResult(navigationBacklinkToSearchResult(backlink))
                }
                onOpenNavigationMissingLink={(missingLink) =>
                  onCommandOpenSearchResult(navigationMissingLinkToSearchResult(missingLink))
                }
                onAction={onCommandAction}
                canCreateWorkspaceEntries={canCreateWorkspaceEntries}
                workspaceIndexed={Boolean(workspaceIndex)}
                indexedFileCount={workspaceIndex?.files.length ?? 0}
                searchIndexRebuilding={searchIndexRebuilding}
                knowledgeSummary={workspaceKnowledgeSummary}
              />
            </Suspense>
          </AppCommandDialog>
        )}
        <WindowControls
          platform={platform}
          isWindows={isWindows}
          isMaximized={isMaximized}
          setIsMaximized={setIsMaximized}
          getAppWindow={getAppWindow}
        />
      </header>
    )
  },
)

Titlebar.displayName = 'Titlebar'

export default memo(Titlebar)
