import {
  Check,
  Circle,
  CircleAlert,
  ListTree,
  LoaderCircle,
  PanelLeft,
  Search,
  Settings,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ViewMode } from '@/store/appTypes'
import { TabsBarViewModeControls } from '@/components/TabsBarViewModeControls'
import { TitlebarWorkspaceMenu } from '@/components/TitlebarWorkspaceMenu'

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error'

type ImmersiveTitlebarChromeProps = {
  activePath: string | null
  saveStatus: SaveStatus
  searchLabel: string
  savedLabel: string
  savingLabel: string
  unsavedLabel: string
  saveErrorLabel: string
  localLibraryLabel: string
  untitledLabel: string
  toggleSidebarLabel: string
  toggleOutlineLabel: string
  settingsLabel: string
  viewMode: ViewMode
  wysiwygLabel: string
  sourceLabel: string
  graphLabel: string
  workspaceMenuLabel: string
  newWorkspaceLabel: string
  openFileLabel: string
  newFileLabel: string
  openCurrentWorkspaceInNewWindowLabel: string
  openWorkspaceInNewWindowLabel: string
  onOpenSearch: () => void
  onToggleSidebar: () => void
  onToggleOutline: () => void
  onOpenSettings: () => void
  onChangeView: (mode: ViewMode) => void
  onNewWorkspace: () => void
  onOpenFile: () => void
  onCreateFile: () => void
  onOpenCurrentWorkspaceInNewWindow: () => void
  onSelectWorkspaceInNewWindow: () => void
  workspaceWindowOpening: boolean
}

const getDocumentContext = (
  activePath: string | null,
  localLibraryLabel: string,
  untitledLabel: string,
) => {
  if (!activePath) return { section: localLibraryLabel, title: untitledLabel }

  const parts = activePath.split(/[\\/]/).filter(Boolean)
  const filename = parts.at(-1) ?? activePath
  const title = filename.replace(/\.(md|markdown)$/i, '')
  const section = parts.length > 1 ? parts.slice(0, -1).join(' / ') : localLibraryLabel

  return { section, title }
}

const savePresentation = (
  status: SaveStatus,
  labels: Pick<
    ImmersiveTitlebarChromeProps,
    'savedLabel' | 'savingLabel' | 'unsavedLabel' | 'saveErrorLabel'
  >,
) => {
  if (status === 'saving') return { Icon: LoaderCircle, label: labels.savingLabel }
  if (status === 'unsaved') return { Icon: Circle, label: labels.unsavedLabel }
  if (status === 'error') return { Icon: CircleAlert, label: labels.saveErrorLabel }
  return { Icon: Check, label: labels.savedLabel }
}

export const ImmersiveTitlebarChrome = ({
  activePath,
  saveStatus,
  searchLabel,
  savedLabel,
  savingLabel,
  unsavedLabel,
  saveErrorLabel,
  localLibraryLabel,
  untitledLabel,
  toggleSidebarLabel,
  toggleOutlineLabel,
  settingsLabel,
  viewMode,
  wysiwygLabel,
  sourceLabel,
  graphLabel,
  workspaceMenuLabel,
  newWorkspaceLabel,
  openFileLabel,
  newFileLabel,
  openCurrentWorkspaceInNewWindowLabel,
  openWorkspaceInNewWindowLabel,
  onOpenSearch,
  onToggleSidebar,
  onToggleOutline,
  onOpenSettings,
  onChangeView,
  onNewWorkspace,
  onOpenFile,
  onCreateFile,
  onOpenCurrentWorkspaceInNewWindow,
  onSelectWorkspaceInNewWindow,
  workspaceWindowOpening,
}: ImmersiveTitlebarChromeProps) => {
  const context = getDocumentContext(activePath, localLibraryLabel, untitledLabel)
  const logoUrl = new URL('marklab-light.svg', document.baseURI).toString()
  const darkLogoUrl = new URL('marklab-dark.svg', document.baseURI).toString()
  const save = savePresentation(saveStatus, {
    savedLabel,
    savingLabel,
    unsavedLabel,
    saveErrorLabel,
  })

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
          <PanelLeft aria-hidden="true" className="size-4" />
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
          section={context.section}
          workspaceMenuLabel={workspaceMenuLabel}
          newWorkspaceLabel={newWorkspaceLabel}
          openFileLabel={openFileLabel}
          newFileLabel={newFileLabel}
          openCurrentWorkspaceInNewWindowLabel={openCurrentWorkspaceInNewWindowLabel}
          openWorkspaceInNewWindowLabel={openWorkspaceInNewWindowLabel}
          onNewWorkspace={onNewWorkspace}
          onOpenFile={onOpenFile}
          onCreateFile={onCreateFile}
          onOpenCurrentWorkspaceInNewWindow={onOpenCurrentWorkspaceInNewWindow}
          onSelectWorkspaceInNewWindow={onSelectWorkspaceInNewWindow}
          workspaceWindowOpening={workspaceWindowOpening}
        />
      </div>

      <span className="pointer-events-none absolute left-1/2 hidden max-w-[32vw] -translate-x-1/2 truncate px-6 text-center text-[15px] font-medium text-foreground/85 md:block">
        {context.title}
      </span>

      <div className="flex min-w-0 items-center justify-end gap-1">
        <span
          aria-live="polite"
          role="status"
          className={cn(
            'sr-only items-center gap-1.5 px-2 text-[13px] text-muted-foreground lg:not-sr-only lg:flex',
            saveStatus === 'error' && 'text-destructive',
          )}
        >
          <save.Icon
            aria-hidden="true"
            className={cn('size-3.5', saveStatus === 'saving' && 'animate-spin')}
          />
          {save.label}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={searchLabel}
          className="chrome-button size-8 rounded-full"
          data-no-drag
          onClick={onOpenSearch}
        >
          <Search aria-hidden="true" className="size-4" />
        </Button>
        <TabsBarViewModeControls
          active={Boolean(activePath)}
          viewMode={viewMode}
          wysiwygLabel={wysiwygLabel}
          sourceLabel={sourceLabel}
          graphLabel={graphLabel}
          onChangeView={onChangeView}
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
          <ListTree aria-hidden="true" className="size-4" />
          <span className="hidden text-xs font-medium xl:inline">{toggleOutlineLabel}</span>
        </Button>
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
          <Settings aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </div>
  )
}
