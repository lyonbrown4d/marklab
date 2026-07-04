import { useEffect, useMemo, useRef, useState } from 'react'
import { FilePlus2, Files, FolderPlus, Search } from 'lucide-react'
import AppEmptyState from '@/components/AppEmptyState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import SidebarFileTree from '@/components/SidebarFileTree'
import { FileNameDialog } from '@/components/file-tree/FileOperationDialogs'
import type { SidebarExplorerPanelProps } from '@/components/sidebarPanelTypes'
import { useI18n } from '@/i18n/useI18n'
import { filterTree } from '@/logic/fileTree'

type RootCreateKind = 'file' | 'folder'

const ExplorerToolbarButton = ({
  label,
  icon: Icon,
  onClick,
}: {
  label: string
  icon: typeof FilePlus2
  onClick: () => void
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
        aria-label={label}
        onClick={onClick}
      >
        <Icon aria-hidden="true" />
      </Button>
    </TooltipTrigger>
    <TooltipContent side="bottom" sideOffset={6}>
      {label}
    </TooltipContent>
  </Tooltip>
)

const SidebarExplorerPanel = ({
  activePath,
  fileCount,
  fileTree,
  focusFileFilterRequest,
  onCreateFile,
  onCreateFolder,
  onDeletePath,
  onInspectPath,
  onOpenFile,
  onOpenFileView,
  onMovePath,
  onRenamePath,
  rootKind,
}: SidebarExplorerPanelProps) => {
  const { t } = useI18n()
  const [filter, setFilter] = useState('')
  const [rootCreateKind, setRootCreateKind] = useState<RootCreateKind | null>(null)
  const filterInputRef = useRef<HTMLInputElement | null>(null)
  const readonlyTree = rootKind === 'single'
  const visibleTree = useMemo(() => filterTree(fileTree, filter), [fileTree, filter])
  const hasVisibleFiles = visibleTree.length > 0
  const hasFilter = filter.trim().length > 0
  const emptyMessage = readonlyTree
    ? fileTree.length > 0
      ? t('sidebar.noSearchResults')
      : t('sidebar.singleFileEmpty')
    : hasFilter
      ? t('sidebar.noSearchResults')
      : t('sidebar.noProjectLoaded')
  const labels = useMemo(
    () => ({
      open: t('context.open'),
      openSource: t('context.openSource'),
      openGraph: t('context.openGraph'),
      openInSystem: t('context.openInSystem'),
      revealInFolder: t('context.revealInFolder'),
      copyPath: t('context.copyPath'),
      copyAbsolutePath: t('context.copyAbsolutePath'),
      copyMarkdownLink: t('context.copyMarkdownLink'),
      copied: t('context.copied'),
      actionFailed: t('context.actionFailed'),
      expand: t('context.expand'),
      collapse: t('context.collapse'),
      newFile: t('context.newFile'),
      newFolder: t('context.newFolder'),
      rename: t('context.rename'),
      delete: t('context.delete'),
      properties: t('context.properties'),
      newFilePrompt: t('context.newFilePrompt'),
      newFolderPrompt: t('context.newFolderPrompt'),
      renamePrompt: t('context.renamePrompt'),
      deleteConfirm: t('context.deleteConfirm', { name: '{name}' }),
      deleteFolderConfirm: t('context.deleteFolderConfirm', { name: '{name}' }),
    }),
    [t],
  )
  const rootCreateTitle = rootCreateKind === 'file' ? labels.newFile : labels.newFolder
  const rootCreateDescription =
    rootCreateKind === 'file' ? labels.newFilePrompt : labels.newFolderPrompt
  const emptyIcon = hasFilter ? <Search /> : <Files />

  const handleRootCreate = (path: string) => {
    if (rootCreateKind === 'file') {
      onCreateFile(path)
      return
    }
    if (rootCreateKind === 'folder') {
      onCreateFolder(path)
    }
  }

  useEffect(() => {
    if (focusFileFilterRequest === 0) return
    filterInputRef.current?.focus()
    filterInputRef.current?.select()
  }, [focusFileFilterRequest])

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      <SidebarGroup className="min-h-0 flex-1 rounded-lg border border-sidebar-border/60 bg-sidebar/45 p-1.5">
        <SidebarGroupLabel className="flex h-auto items-start justify-between gap-2 px-1.5 py-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Files aria-hidden="true" className="size-3.5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground">
                {t('sidebar.files')}
              </div>
              <div className="mt-0.5 text-[11px] font-normal normal-case tracking-normal text-muted-foreground">
                {readonlyTree ? t('sidebar.singleFileMode') : t('sidebar.recentProjects')}
              </div>
            </div>
          </div>
          <TooltipProvider delayDuration={180}>
            <div className="flex shrink-0 items-center gap-1">
              <Badge variant="secondary" className="h-5 rounded px-1.5 text-[10px]">
                {fileCount}
              </Badge>
              {!readonlyTree && (
                <>
                  <ExplorerToolbarButton
                    label={t('sidebar.newFile')}
                    icon={FilePlus2}
                    onClick={() => setRootCreateKind('file')}
                  />
                  <ExplorerToolbarButton
                    label={t('sidebar.newFolder')}
                    icon={FolderPlus}
                    onClick={() => setRootCreateKind('folder')}
                  />
                </>
              )}
            </div>
          </TooltipProvider>
        </SidebarGroupLabel>
        <SidebarGroupContent className="flex min-h-0 flex-1 flex-col gap-2">
          {readonlyTree && (
            <div className="rounded-md border border-sidebar-border/70 bg-background/50 px-2.5 py-2 text-xs leading-5 text-muted-foreground">
              {t('sidebar.singleFileReadonlyHint')}
            </div>
          )}
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              ref={filterInputRef}
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={t('sidebar.search')}
              aria-label={t('sidebar.search')}
              className="h-8 rounded-md border-sidebar-border bg-background/70 pl-7 text-xs shadow-sm transition-colors focus-visible:border-ring"
            />
          </div>
          <Separator className="bg-sidebar-border/70" />
          <div className="min-h-0 flex-1 overflow-hidden pr-1">
            {!hasVisibleFiles ? (
              <AppEmptyState
                compact
                className="min-h-28 flex-none border-sidebar-border/70 bg-background/40 px-3 py-4 md:p-4"
                icon={emptyIcon}
                mediaClassName="mb-0 size-8 border border-sidebar-border bg-background/80 text-muted-foreground [&_svg:not([class*='size-'])]:size-4"
                role="status"
                title={emptyMessage}
                titleClassName="text-[11px] font-normal text-muted-foreground"
                titleLevel={3}
              />
            ) : (
              <SidebarFileTree
                nodes={fileTree}
                searchTerm={filter}
                activePath={activePath}
                readonlyTree={readonlyTree}
                labels={labels}
                onOpenFile={onOpenFile}
                onOpenFileView={onOpenFileView}
                onCreateFile={onCreateFile}
                onCreateFolder={onCreateFolder}
                onMovePath={onMovePath}
                onRenamePath={onRenamePath}
                onDeletePath={onDeletePath}
                onInspectPath={onInspectPath}
              />
            )}
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
      <FileNameDialog
        open={rootCreateKind !== null}
        title={rootCreateTitle}
        description={rootCreateDescription}
        defaultValue=""
        confirmLabel={rootCreateTitle}
        onOpenChange={(open) => {
          if (!open) setRootCreateKind(null)
        }}
        onSubmit={handleRootCreate}
      />
    </div>
  )
}

export default SidebarExplorerPanel
