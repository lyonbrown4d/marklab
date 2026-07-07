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
import TitlebarCommandDialogFallback from '@/components/TitlebarCommandDialogFallback'
import { TooltipProvider } from '@/components/ui/tooltip'
import { isDesktopRuntime } from '@/runtime/window'
import { TitlebarActions } from '@/components/titlebar/TitlebarActions'
import { TitlebarCommandCenter } from '@/components/titlebar/TitlebarCommandCenter'
import { TitlebarNavigation } from '@/components/titlebar/TitlebarNavigation'
import type { TitlebarProps } from '@/components/titlebar/titlebarTypes'
import { useTitlebarCommandModel } from '@/components/titlebar/useTitlebarCommandModel'
import {
  navigationBacklinkToSearchResult,
  navigationMissingLinkToSearchResult,
} from '@/components/titlebar/titlebarCommandNavigation'
import { useTitlebarPlatform } from '@/components/titlebar/useTitlebarPlatform'
import { cn } from '@/lib/utils'
import { useDeferredOpenContent } from '@/hooks/useDeferredOpenContent'

const TitlebarCommandDialog = lazy(() => import('@/components/TitlebarCommandDialog'))

export type TitlebarHandle = {
  openCommandPalette: () => void
}

const Titlebar = forwardRef<TitlebarHandle, TitlebarProps>(
  (
    {
      activePath,
      activeTab,
      tabs,
      dirtyPaths,
      saveStates,
      silentSave,
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
      theme,
      setTheme,
      commandOpen: controlledCommandOpen,
      onCommandOpenChange,
      onOpenSettings,
    },
    ref,
  ) => {
    const [internalCommandOpen, setInternalCommandOpen] = useState(false)
    const commandOpen = controlledCommandOpen ?? internalCommandOpen
    const commandDataReady = useDeferredOpenContent(commandOpen)
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

    const { platform, getAppWindow, isWindows, showInlineMenu, isMacDesktop } =
      useTitlebarPlatform()
    const {
      menuGroups,
      commandFiles,
      commandHeadings,
      commandNavigationHeadings,
      commandNavigationOutgoingLinks,
      commandNavigationBacklinks,
      commandNavigationMissingLinks,
      commandRecentFiles,
      commandCollections,
      workspaceKnowledgeSummary,
      commandPaletteShortcut,
      onMenuAction,
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

    return (
      <header
        className={cn(
          'app-titlebar flex h-11 items-center justify-between border-b border-border/80 px-2.5',
          isMacDesktop && 'pl-[76px]',
        )}
        onMouseDown={handleTitlebarMouseDown}
      >
        <TooltipProvider>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <TitlebarNavigation
              showInlineMenu={showInlineMenu}
              menuGroups={menuGroups}
              onMenuAction={onMenuAction}
              onToggleSidebar={onToggleSidebar}
            />
            <TitlebarCommandCenter
              activePath={activePath}
              activeTab={activeTab}
              dirtyPaths={dirtyPaths}
              saveStates={saveStates}
              silentSave={silentSave}
              commandPaletteShortcut={commandPaletteShortcut}
              onOpenSearch={onOpenSearch}
            />
            <TitlebarActions
              theme={theme}
              setTheme={setTheme}
              onMenuAction={onMenuAction}
              onOpenSearch={onOpenSearch}
              onOpenSettings={onOpenSettings}
              onSelectProject={onSelectProject}
              onSelectSingleFile={onSelectSingleFile}
              onToggleRightSidebar={onToggleRightSidebar}
            />
          </div>
        </TooltipProvider>
        {commandOpen && (
          <Suspense
            fallback={
              <TitlebarCommandDialogFallback open={commandOpen} onOpenChange={setCommandOpen} />
            }
          >
            <TitlebarCommandDialog
              open={commandOpen}
              onOpenChange={setCommandOpen}
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
