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
import { useTitlebarPlatform } from '@/components/titlebar/useTitlebarPlatform'

const Titlebar = ({
  activePath,
  activeTab,
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
    workspaceKnowledgeSummary,
    commandPaletteShortcut,
    onMenuAction,
    onOpenSearch,
    onCommandAction,
    onCommandOpenFile,
    onCommandOpenHeading,
    onCommandOpenSearchResult,
  } = useTitlebarCommandModel({
    files,
    workspaceIndex,
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
      className={`app-titlebar flex h-11 items-center justify-between border-b border-border/80 px-2.5 ${isMacDesktop ? 'pl-[68px]' : ''}`}
      onMouseDown={handleTitlebarMouseDown}
    >
      <TooltipProvider>
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
      </TooltipProvider>
      <TitlebarCommandDialog
        open={commandOpen}
        onOpenChange={onCommandOpenChange}
        files={commandFiles}
        headings={commandHeadings}
        onOpenFile={onCommandOpenFile}
        onOpenHeading={onCommandOpenHeading}
        onOpenSearchResult={onCommandOpenSearchResult}
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
