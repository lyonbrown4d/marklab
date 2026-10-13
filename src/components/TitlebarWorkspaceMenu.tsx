import {
  ChevronDown,
  Download,
  ExternalLink,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  menuItemStyles,
  menuSeparatorStyles,
  menuSurfaceStyles,
} from '@/components/overlay/overlayStyles'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useRef, useState } from 'react'
import { useNativeSurfaceOcclusion } from '@/app/nativeSurfaceOcclusion'
import { WorkspaceSyncBindingDialog } from '@/features/workspace-sync/WorkspaceSyncBindingDialog'
import { WorkspaceSyncMenuSection } from '@/features/workspace-sync/WorkspaceSyncMenuSection'
import { RecentWorkspaceMenuSection } from '@/components/titlebar/RecentWorkspaceMenuSection'

export type RecentWorkspaceMenuData = {
  currentLabel: string
  emptyLabel: string
  openLabel: string
  paths: string[]
  rootKind: 'internal' | 'external' | 'single'
  rootPath: string
  sectionLabel: string
}

type TitlebarWorkspaceMenuProps = {
  section: string
  workspaceMenuLabel: string
  newWorkspaceLabel: string
  openFileLabel: string
  newFileLabel: string
  exportWorkspaceLabel: string
  recentWorkspaces: RecentWorkspaceMenuData
  openCurrentWorkspaceInNewWindowLabel: string
  openWorkspaceInNewWindowLabel: string
  onNewWorkspace: () => void
  onOpenFile: () => void
  onCreateFile: () => void
  onExportWorkspace: () => void
  onOpenProject: (path: string) => void
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
  exportWorkspaceLabel,
  recentWorkspaces,
  openCurrentWorkspaceInNewWindowLabel,
  openWorkspaceInNewWindowLabel,
  onNewWorkspace,
  onOpenFile,
  onCreateFile,
  onExportWorkspace,
  onOpenProject,
  onOpenCurrentWorkspaceInNewWindow,
  onSelectWorkspaceInNewWindow,
  workspaceWindowOpening,
}: TitlebarWorkspaceMenuProps) => {
  const [open, setOpen] = useState(false)
  const [bindingOpen, setBindingOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  useNativeSurfaceOcclusion('workspace-menu', open)
  useNativeSurfaceOcclusion('workspace-sync-dialog', bindingOpen, {
    blocksCommandPalette: true,
  })
  const configureWebDav = () => {
    setOpen(false)
    window.setTimeout(() => setBindingOpen(true), 0)
  }
  const changeBindingOpen = (nextOpen: boolean) => {
    setBindingOpen(nextOpen)
    if (!nextOpen) window.setTimeout(() => triggerRef.current?.focus(), 0)
  }

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            ref={triggerRef}
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
          className={menuSurfaceStyles({ className: 'w-72' })}
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
          <DropdownMenuSeparator className={menuSeparatorStyles} />
          <DropdownMenuItem
            className={menuItemStyles({ className: 'py-2' })}
            disabled={recentWorkspaces.rootKind === 'single'}
            onSelect={onExportWorkspace}
          >
            <Download aria-hidden="true" />
            {exportWorkspaceLabel}
          </DropdownMenuItem>
          <DropdownMenuSeparator className={menuSeparatorStyles} />
          <WorkspaceSyncMenuSection
            rootKind={recentWorkspaces.rootKind}
            rootPath={recentWorkspaces.rootPath}
            onConfigureWebDav={configureWebDav}
          />
          <DropdownMenuSeparator className={menuSeparatorStyles} />
          <DropdownMenuLabel className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {recentWorkspaces.sectionLabel}
          </DropdownMenuLabel>
          <DropdownMenuGroup>
            <RecentWorkspaceMenuSection
              data={recentWorkspaces}
              enabled={open}
              opening={workspaceWindowOpening}
              onOpenProject={onOpenProject}
              onRemoved={() => setOpen(false)}
            />
            <DropdownMenuSeparator className={menuSeparatorStyles} />
            <DropdownMenuItem
              className={menuItemStyles()}
              disabled={workspaceWindowOpening}
              onSelect={onOpenCurrentWorkspaceInNewWindow}
            >
              <ExternalLink aria-hidden="true" />
              {openCurrentWorkspaceInNewWindowLabel}
            </DropdownMenuItem>
            <DropdownMenuItem
              className={menuItemStyles()}
              disabled={workspaceWindowOpening}
              onSelect={onSelectWorkspaceInNewWindow}
            >
              <FolderOpen aria-hidden="true" />
              {openWorkspaceInNewWindowLabel}
            </DropdownMenuItem>
            <DropdownMenuSeparator className={menuSeparatorStyles} />
            <DropdownMenuItem className={menuItemStyles()} onSelect={onNewWorkspace}>
              <FolderPlus aria-hidden="true" />
              {newWorkspaceLabel}
            </DropdownMenuItem>
            <DropdownMenuItem className={menuItemStyles()} onSelect={onOpenFile}>
              <FileText aria-hidden="true" />
              {openFileLabel}
            </DropdownMenuItem>
            <DropdownMenuItem className={menuItemStyles()} onSelect={onCreateFile}>
              <FilePlus2 aria-hidden="true" />
              {newFileLabel}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {bindingOpen ? (
        <WorkspaceSyncBindingDialog
          open
          rootPath={recentWorkspaces.rootPath}
          onOpenChange={changeBindingOpen}
        />
      ) : null}
    </>
  )
}
