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
import { useQueryClient } from '@tanstack/react-query'
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
import { useNativeSurfaceOcclusion } from '@/app/nativeSurfaceOcclusion'
import { useDoubleShiftCommandPalette } from '@/components/command/useDoubleShiftCommandPalette'
import { preloadWorkspaceGraph } from '@/app/preloadWorkspaceGraph'

const TitlebarCommandDialog = lazy(() => import('@/components/TitlebarCommandDialog'))
const noop = () => undefined

export type TitlebarHandle = {
  openCommandPalette: () => void
}

const Titlebar = forwardRef<TitlebarHandle, TitlebarProps>(
  (
    {
      activePath,
      activeTab,
      tabs,
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
      onOpenWorkspaceFiles = noop,
      onOpenAllPages,
      onOpenProject,
      onOpenCurrentWorkspaceInNewWindow,
      onSelectWorkspaceInNewWindow,
      onToggleReadOnly,
      onCloseActiveTab,
      onOpenTerminal,
      onRebuildSearchIndex,
      onChangeView,
      viewMode,
      files,
      workspaceKey,
      canCreateWorkspaceEntries,
      searchIndexRebuilding,
      isMaximized,
      setIsMaximized,
      setTheme,
      commandOpen: controlledCommandOpen,
      onCommandOpenChange,
      onOpenSettings,
      recentProjects,
      rootKind,
      rootPath,
      workspaceWindowOpening,
      workspaceView,
    },
    ref,
  ) => {
    const queryClient = useQueryClient()
    const [internalCommandOpen, setInternalCommandOpen] = useState(false)
    const { t } = useI18n()
    const commandOpen = controlledCommandOpen ?? internalCommandOpen
    useNativeSurfaceOcclusion('command-palette', commandOpen)
    const activeWorkspaceView = workspaceView ?? 'files'
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
    const openCommandPalette = useCallback(() => setCommandOpen(true), [setCommandOpen])
    const handlePreloadWorkspaceGraph = useCallback(() => {
      void preloadWorkspaceGraph(queryClient, workspaceKey)
    }, [queryClient, workspaceKey])
    useDoubleShiftCommandPalette({ enabled: !commandOpen, onOpen: openCommandPalette })

    useImperativeHandle(
      ref,
      () => ({
        openCommandPalette,
      }),
      [openCommandPalette],
    )

    const { platform, getAppWindow, isWindows, isMacDesktop } = useTitlebarPlatform()
    const {
      commandFiles,
      commandRecentFiles,
      onOpenSearch,
      onMenuAction,
      onCommandAction,
      onCommandOpenFile,
      onCommandOpenHeading,
      onCommandOpenSearchResult,
    } = useTitlebarCommandModel({
      activePath,
      files,
      tabs,
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
      onToggleReadOnly,
      onOpenTerminal,
      onRebuildSearchIndex,
      onOpenFile,
      onOpenHeading,
      onOpenSearchResult,
      setTheme,
      platform,
      commandOpen: commandDataReady,
      onOpenCurrentWorkspaceInNewWindow,
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
    return (
      <header
        className={cn(
          'app-titlebar relative flex h-[52px] items-center justify-between border-b border-border/60 px-2.5',
          isMacDesktop && 'pl-[76px]',
        )}
        onMouseDown={handleTitlebarMouseDown}
      >
        <ImmersiveTitlebarChrome
          activePath={activePath}
          activeWorkspaceView={activeWorkspaceView}
          webTitle={activeTab?.kind === 'web' ? activeTab.title : undefined}
          searchLabel={t('sidebar.search')}
          localLibraryLabel={t('titlebar.localLibrary')}
          untitledLabel={t('titlebar.untitled')}
          toggleSidebarLabel={t('actions.toggleSidebar')}
          toggleOutlineLabel={t('titlebar.documentOutline')}
          settingsLabel={t('menu.settings')}
          viewMode={viewMode}
          editorModeLabel={t('editor.modeToggle')}
          wysiwygLabel={t('editor.modeWysiwyg')}
          sourceLabel={t('editor.modeSource')}
          workspaceFilesLabel={t('titlebar.workspaceFiles')}
          workspaceMapLabel={t('titlebar.workspaceMap')}
          workspaceMapTitle={t('titlebar.workspaceMapTitle')}
          workspaceViewLabel={t('titlebar.workspaceView')}
          moreLabel={t('actions.more')}
          recentWorkspaces={{
            currentLabel: t('workspace.current'),
            emptyLabel: t('workspace.noRecent'),
            openLabel: t('workspace.openRecentInNewWindow', { name: '{name}' }),
            paths: recentProjects,
            rootKind,
            rootPath,
            sectionLabel: t('workspace.recent'),
          }}
          workspaceMenuLabel={t('menu.workspace')}
          newWorkspaceLabel={t('actions.newWorkspace')}
          openFileLabel={t('actions.openFile')}
          newFileLabel={t('sidebar.newFile')}
          exportLabel={t('actions.export')}
          exportPdfLabel={t('actions.exportPdf')}
          exportDocxLabel={t('actions.exportDocx')}
          openCurrentWorkspaceInNewWindowLabel={t('actions.openCurrentWorkspaceInNewWindow')}
          openWorkspaceInNewWindowLabel={t('actions.openWorkspaceInNewWindow')}
          onOpenSearch={onOpenSearch}
          onOpenWorkspaceFiles={onOpenWorkspaceFiles}
          onOpenWorkspaceGraph={onOpenWorkspaceGraph}
          onPreloadWorkspaceGraph={handlePreloadWorkspaceGraph}
          onToggleSidebar={onToggleSidebar}
          onToggleOutline={onToggleRightSidebar}
          onOpenSettings={onOpenSettings}
          onChangeView={onChangeView}
          onOpenProject={onOpenProject}
          onNewWorkspace={onSelectProject}
          onOpenFile={onSelectSingleFile}
          onCreateFile={onCreateFile}
          onExport={(format) => onMenuAction(`file.export_${format}`)}
          onOpenCurrentWorkspaceInNewWindow={onOpenCurrentWorkspaceInNewWindow}
          onSelectWorkspaceInNewWindow={onSelectWorkspaceInNewWindow}
          workspaceWindowOpening={workspaceWindowOpening}
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
                searchIndexRebuilding={searchIndexRebuilding}
                workspaceKey={workspaceKey}
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
