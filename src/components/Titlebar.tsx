import { memo, useCallback, type MouseEvent as ReactMouseEvent } from 'react'
import TitlebarCommandDialog from '@/components/TitlebarCommandDialog'
import WindowControls from '@/components/WindowControls'
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

const Titlebar = ({
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
  commandOpen,
  onCommandOpenChange,
  onOpenSettings,
}: TitlebarProps) => {
  const { platform, getAppWindow, isWindows, showInlineMenu, isMacDesktop } = useTitlebarPlatform()
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
    onCommandOpenChange,
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
      className={`app-titlebar flex h-11 items-center justify-between border-b border-border/80 px-2.5 ${isMacDesktop ? 'pl-[76px]' : ''}`}
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
      <TitlebarCommandDialog
        open={commandOpen}
        onOpenChange={onCommandOpenChange}
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
      <WindowControls
        platform={platform}
        isWindows={isWindows}
        isMaximized={isMaximized}
        setIsMaximized={setIsMaximized}
        getAppWindow={getAppWindow}
      />
    </header>
  )
}

export default memo(Titlebar)
