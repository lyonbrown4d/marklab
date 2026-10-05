import {
  Check,
  ChevronDown,
  ExternalLink,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  History,
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
  historyLabel: string
  recentWorkspaces: RecentWorkspaceMenuData
  openCurrentWorkspaceInNewWindowLabel: string
  openWorkspaceInNewWindowLabel: string
  onNewWorkspace: () => void
  onOpenFile: () => void
  onCreateFile: () => void
  onOpenHistory: () => void
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
  historyLabel,
  recentWorkspaces,
  openCurrentWorkspaceInNewWindowLabel,
  openWorkspaceInNewWindowLabel,
  onNewWorkspace,
  onOpenFile,
  onCreateFile,
  onOpenHistory,
  onOpenProject,
  onOpenCurrentWorkspaceInNewWindow,
  onSelectWorkspaceInNewWindow,
  workspaceWindowOpening,
}: TitlebarWorkspaceMenuProps) => {
  const [open, setOpen] = useState(false)
  const [bindingOpen, setBindingOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  useNativeSurfaceOcclusion('workspace-menu', open)
  useNativeSurfaceOcclusion('workspace-sync-dialog', bindingOpen)
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
            {recentWorkspaces.paths.length > 0 ? (
              recentWorkspaces.paths.slice(0, 4).map((path) => {
                const label = workspaceName(path)
                const current =
                  recentWorkspaces.rootKind !== 'internal' && path === recentWorkspaces.rootPath
                return (
                  <DropdownMenuItem
                    key={path}
                    aria-current={current ? 'page' : undefined}
                    aria-label={recentWorkspaces.openLabel.replace('{name}', label)}
                    className={menuItemStyles({ className: 'py-2' })}
                    disabled={workspaceWindowOpening}
                    onSelect={() => onOpenProject(path)}
                  >
                    <FolderOpen aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">{label}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {path}
                      </span>
                    </span>
                    {current ? (
                      <span className="flex shrink-0 items-center gap-1 text-[10px] text-primary">
                        <Check aria-hidden="true" className="size-3" />
                        {recentWorkspaces.currentLabel}
                      </span>
                    ) : null}
                  </DropdownMenuItem>
                )
              })
            ) : (
              <DropdownMenuItem disabled className={menuItemStyles({ className: 'py-2 text-xs' })}>
                {recentWorkspaces.emptyLabel}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className={menuItemStyles()} onSelect={onOpenHistory}>
              <History aria-hidden="true" />
              {historyLabel}
            </DropdownMenuItem>
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

const workspaceName = (path: string) => {
  const parts = path
    .replace(/[\\/]+$/, '')
    .split(/[\\/]/)
    .filter(Boolean)
  return parts.at(-1) ?? path
}
