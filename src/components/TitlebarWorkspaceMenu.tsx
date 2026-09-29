import {
  ChevronDown,
  ExternalLink,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type TitlebarWorkspaceMenuProps = {
  section: string
  workspaceMenuLabel: string
  newWorkspaceLabel: string
  openFileLabel: string
  newFileLabel: string
  openCurrentWorkspaceInNewWindowLabel: string
  openWorkspaceInNewWindowLabel: string
  onNewWorkspace: () => void
  onOpenFile: () => void
  onCreateFile: () => void
  onOpenCurrentWorkspaceInNewWindow: () => void
  onSelectWorkspaceInNewWindow: () => void
  workspaceWindowOpening: boolean
}

export const TitlebarWorkspaceMenu = ({
  section,
  workspaceMenuLabel,
  newWorkspaceLabel,
  openFileLabel,
  newFileLabel,
  openCurrentWorkspaceInNewWindowLabel,
  openWorkspaceInNewWindowLabel,
  onNewWorkspace,
  onOpenFile,
  onCreateFile,
  onOpenCurrentWorkspaceInNewWindow,
  onSelectWorkspaceInNewWindow,
  workspaceWindowOpening,
}: TitlebarWorkspaceMenuProps) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button
        type="button"
        variant="ghost"
        aria-label={`${workspaceMenuLabel}: ${section}`}
        className="chrome-button h-8 min-w-0 max-w-28 gap-1 rounded-full px-2 text-xs font-normal text-muted-foreground lg:max-w-48"
        data-no-drag
      >
        <span className="truncate">{section}</span>
        <ChevronDown aria-hidden="true" className="size-3.5 shrink-0" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent
      align="start"
      className="w-64 rounded-xl border-border/70 bg-popover/98 p-2 shadow-xl shadow-foreground/10 backdrop-blur-xl"
      sideOffset={7}
    >
      <DropdownMenuLabel className="flex min-w-0 items-center gap-2 px-2 py-2 font-normal">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Folder aria-hidden="true" className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] text-muted-foreground">{workspaceMenuLabel}</span>
          <span className="block truncate text-sm font-medium text-foreground">{section}</span>
        </span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem
          className="rounded-lg px-2.5 py-2"
          disabled={workspaceWindowOpening}
          onSelect={onOpenCurrentWorkspaceInNewWindow}
        >
          <ExternalLink aria-hidden="true" />
          {openCurrentWorkspaceInNewWindowLabel}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="rounded-lg px-2.5 py-2"
          disabled={workspaceWindowOpening}
          onSelect={onSelectWorkspaceInNewWindow}
        >
          <FolderOpen aria-hidden="true" />
          {openWorkspaceInNewWindowLabel}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="rounded-lg px-2.5 py-2 focus:bg-primary/10 focus:text-foreground"
          onSelect={onNewWorkspace}
        >
          <FolderPlus aria-hidden="true" />
          {newWorkspaceLabel}
        </DropdownMenuItem>
        <DropdownMenuItem className="rounded-lg px-2.5 py-2" onSelect={onOpenFile}>
          <FileText aria-hidden="true" />
          {openFileLabel}
        </DropdownMenuItem>
        <DropdownMenuItem className="rounded-lg px-2.5 py-2" onSelect={onCreateFile}>
          <FilePlus2 aria-hidden="true" />
          {newFileLabel}
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>
)
