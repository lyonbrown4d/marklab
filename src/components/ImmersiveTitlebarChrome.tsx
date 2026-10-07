import { ListTree, PanelLeft, Search, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ViewMode } from '@/store/appTypes'
import { TabsBarViewModeControls } from '@/components/TabsBarViewModeControls'
import { TitlebarWorkspaceMenu } from '@/components/TitlebarWorkspaceMenu'
import type { RecentWorkspaceMenuData } from '@/components/TitlebarWorkspaceMenu'
import TitlebarOverflowMenu from '@/components/TitlebarOverflowMenu'
import { TitlebarExportMenu } from '@/components/TitlebarExportMenu'
import { WorkspaceViewSwitcher } from '@/components/WorkspaceViewSwitcher'
import type { ExportFormat } from '@/services/exportApi'
import type { WorkspaceView } from '@/app/useEditorRoutes'

type ImmersiveTitlebarChromeProps = {
  activePath: string | null
  activeWorkspaceView: WorkspaceView
  webTitle?: string
  searchLabel: string
  localLibraryLabel: string
  untitledLabel: string
  toggleSidebarLabel: string
  toggleOutlineLabel: string
  settingsLabel: string
  viewMode: ViewMode
  editorModeLabel: string
  wysiwygLabel: string
  sourceLabel: string
  workspaceFilesLabel: string
  workspaceMapLabel: string
  workspaceMapTitle: string
  workspaceViewLabel: string
  moreLabel: string
  recentWorkspaces: RecentWorkspaceMenuData
  workspaceMenuLabel: string
  newWorkspaceLabel: string
  openFileLabel: string
  newFileLabel: string
  exportLabel: string
  exportPdfLabel: string
  exportDocxLabel: string
  openCurrentWorkspaceInNewWindowLabel: string
  openWorkspaceInNewWindowLabel: string
  onOpenSearch: () => void
  onOpenWorkspaceFiles: () => void
  onOpenWorkspaceGraph: () => void
  onToggleSidebar: () => void
  onToggleOutline: () => void
  onOpenSettings: () => void
  onChangeView: (mode: ViewMode) => void
  onOpenProject: (path: string) => void
  onNewWorkspace: () => void
  onOpenFile: () => void
  onCreateFile: () => void
  onExport: (format: Extract<ExportFormat, 'pdf' | 'docx'>) => void
  onOpenCurrentWorkspaceInNewWindow: () => void
  onSelectWorkspaceInNewWindow: () => void
  workspaceWindowOpening: boolean
}

const getDocumentTitle = (activePath: string | null, untitledLabel: string) => {
  if (!activePath) return untitledLabel

  const parts = activePath.split(/[\\/]/).filter(Boolean)
  const filename = parts.at(-1) ?? activePath
  return filename.replace(/\.(md|markdown)$/i, '')
}

const getWorkspaceLabel = (
  recentWorkspaces: RecentWorkspaceMenuData,
  localLibraryLabel: string,
) => {
  if (recentWorkspaces.rootKind === 'internal' || !recentWorkspaces.rootPath) {
    return localLibraryLabel
  }

  const parts = recentWorkspaces.rootPath
    .replace(/[\\/]+$/, '')
    .split(/[\\/]/)
    .filter(Boolean)
  return parts.at(-1) ?? localLibraryLabel
}

export const ImmersiveTitlebarChrome = ({
  activePath,
  activeWorkspaceView,
  webTitle,
  searchLabel,
  localLibraryLabel,
  untitledLabel,
  toggleSidebarLabel,
  toggleOutlineLabel,
  settingsLabel,
  viewMode,
  editorModeLabel,
  wysiwygLabel,
  sourceLabel,
  workspaceFilesLabel,
  workspaceMapLabel,
  workspaceMapTitle,
  workspaceViewLabel,
  moreLabel,
  recentWorkspaces,
  workspaceMenuLabel,
  newWorkspaceLabel,
  openFileLabel,
  newFileLabel,
  exportLabel,
  exportPdfLabel,
  exportDocxLabel,
  openCurrentWorkspaceInNewWindowLabel,
  openWorkspaceInNewWindowLabel,
  onOpenSearch,
  onOpenWorkspaceFiles,
  onOpenWorkspaceGraph,
  onToggleSidebar,
  onToggleOutline,
  onOpenSettings,
  onChangeView,
  onOpenProject,
  onNewWorkspace,
  onOpenFile,
  onCreateFile,
  onExport,
  onOpenCurrentWorkspaceInNewWindow,
  onSelectWorkspaceInNewWindow,
  workspaceWindowOpening,
}: ImmersiveTitlebarChromeProps) => {
  const documentActionsVisible = activeWorkspaceView !== 'map' && !webTitle
  const documentTitle = webTitle
    ? webTitle
    : documentActionsVisible
      ? getDocumentTitle(activePath, untitledLabel)
      : workspaceMapTitle
  const workspaceLabel = getWorkspaceLabel(recentWorkspaces, localLibraryLabel)
  const logoUrl = new URL('marklab-light.svg', document.baseURI).toString()
  const darkLogoUrl = new URL('marklab-dark.svg', document.baseURI).toString()

  return (
    <div className="immersive-titlebar-chrome grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center">
      <div className="flex min-w-0 items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={toggleSidebarLabel}
          className="chrome-button size-8 shrink-0 rounded-full"
          data-no-drag
          onClick={onToggleSidebar}
        >
          <PanelLeft aria-hidden="true" />
        </Button>
        <div className="flex shrink-0 items-center gap-2 px-1">
          <img
            src={logoUrl}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="size-7 select-none dark:hidden"
          />
          <img
            src={darkLogoUrl}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="hidden size-7 select-none dark:block"
          />
          <span className="hidden text-[15px] font-semibold tracking-[-0.01em] xl:inline">
            Marklab
          </span>
        </div>
        <span aria-hidden="true" className="hidden h-4 w-px shrink-0 bg-border/70 sm:block" />
        <TitlebarWorkspaceMenu
          section={workspaceLabel}
          workspaceMenuLabel={workspaceMenuLabel}
          newWorkspaceLabel={newWorkspaceLabel}
          openFileLabel={openFileLabel}
          newFileLabel={newFileLabel}
          recentWorkspaces={recentWorkspaces}
          openCurrentWorkspaceInNewWindowLabel={openCurrentWorkspaceInNewWindowLabel}
          openWorkspaceInNewWindowLabel={openWorkspaceInNewWindowLabel}
          onNewWorkspace={onNewWorkspace}
          onOpenFile={onOpenFile}
          onCreateFile={onCreateFile}
          onOpenProject={onOpenProject}
          onOpenCurrentWorkspaceInNewWindow={onOpenCurrentWorkspaceInNewWindow}
          onSelectWorkspaceInNewWindow={onSelectWorkspaceInNewWindow}
          workspaceWindowOpening={workspaceWindowOpening}
        />
        {recentWorkspaces.rootKind !== 'single' ? (
          <WorkspaceViewSwitcher
            activeView={activeWorkspaceView}
            filesLabel={workspaceFilesLabel}
            groupLabel={workspaceViewLabel}
            mapLabel={workspaceMapLabel}
            onOpenFiles={onOpenWorkspaceFiles}
            onOpenMap={onOpenWorkspaceGraph}
          />
        ) : null}
      </div>

      <span className="pointer-events-none absolute left-1/2 block max-w-[28vw] -translate-x-1/2 truncate px-3 text-center text-sm font-medium text-foreground/85 sm:max-w-[36vw] sm:text-[15px]">
        {documentTitle}
      </span>

      <div
        className="hidden min-w-0 items-center justify-end gap-1 lg:flex"
        data-slot="wide-titlebar-actions"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={searchLabel}
          className="chrome-button size-8 rounded-full"
          data-no-drag
          onClick={onOpenSearch}
        >
          <Search aria-hidden="true" />
        </Button>
        {documentActionsVisible ? (
          <>
            <TabsBarViewModeControls
              active={Boolean(activePath)}
              groupLabel={editorModeLabel}
              viewMode={viewMode}
              wysiwygLabel={wysiwygLabel}
              sourceLabel={sourceLabel}
              onChangeView={onChangeView}
            />
            <TitlebarExportMenu
              disabled={!activePath}
              exportLabel={exportLabel}
              exportPdfLabel={exportPdfLabel}
              exportDocxLabel={exportDocxLabel}
              onExport={onExport}
            />
            <span aria-hidden="true" className="mx-1 h-4 w-px bg-border/70" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={toggleOutlineLabel}
              className="chrome-button size-8 rounded-full xl:w-auto xl:gap-2 xl:px-3"
              data-no-drag
              onClick={onToggleOutline}
            >
              <ListTree aria-hidden="true" />
              <span className="hidden text-xs font-medium xl:inline">{toggleOutlineLabel}</span>
            </Button>
          </>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={settingsLabel}
          title={settingsLabel}
          className="chrome-button size-8 rounded-full"
          data-no-drag
          onClick={onOpenSettings}
        >
          <Settings aria-hidden="true" />
        </Button>
      </div>
      <div
        className="flex min-w-0 items-center justify-end lg:hidden"
        data-slot="compact-titlebar-actions"
      >
        <TitlebarOverflowMenu
          active={Boolean(activePath)}
          documentActionsVisible={documentActionsVisible}
          exportDocxLabel={exportDocxLabel}
          exportLabel={exportLabel}
          exportPdfLabel={exportPdfLabel}
          moreLabel={moreLabel}
          searchLabel={searchLabel}
          settingsLabel={settingsLabel}
          sourceLabel={sourceLabel}
          toggleOutlineLabel={toggleOutlineLabel}
          viewMode={viewMode}
          wysiwygLabel={wysiwygLabel}
          onChangeView={onChangeView}
          onExport={onExport}
          onOpenSearch={onOpenSearch}
          onOpenSettings={onOpenSettings}
          onToggleOutline={onToggleOutline}
        />
      </div>
    </div>
  )
}
