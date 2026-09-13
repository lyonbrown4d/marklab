import { useEffect, useId, useMemo, useRef, useState, type Ref } from 'react'
import { FilePlus2, Files, FolderPlus, Search } from 'lucide-react'
import AppEmptyState from '@/components/AppEmptyState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  expanded,
  controls,
  buttonRef,
}: {
  label: string
  icon: typeof FilePlus2
  onClick: () => void
  expanded?: boolean
  controls?: string
  buttonRef?: Ref<HTMLButtonElement>
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        ref={buttonRef}
        type="button"
        variant="ghost"
        size="icon"
        className="size-7 rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
        aria-label={label}
        aria-expanded={expanded}
        aria-controls={controls}
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
  const [filterVisibility, setFilterVisibility] = useState({ open: false, request: 0 })
  const filterOpen = filterVisibility.open || focusFileFilterRequest > filterVisibility.request
  const setFilterOpen = (open: boolean) => {
    setFilterVisibility({ open, request: focusFileFilterRequest })
  }
  const filterId = useId()
  const filterButtonRef = useRef<HTMLButtonElement>(null)
  const [rootCreateOpen, setRootCreateOpen] = useState(false)
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

  useEffect(() => {
    if (!filterOpen) return
    filterInputRef.current?.focus()
    filterInputRef.current?.select()
  }, [filterOpen, focusFileFilterRequest])

  const handleRootCreate = async (path: string) => {
    if (rootCreateKind === 'file') await onCreateFile(path)
    if (rootCreateKind === 'folder') await onCreateFolder(path)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      <SidebarGroup className="min-h-0 flex-1 p-0">
        <div className="flex shrink-0 items-center gap-1 px-1 pb-1">
          <SidebarGroupLabel className="h-8 min-w-0 flex-1 gap-1.5 truncate px-1 text-xs font-medium">
            {readonlyTree ? t('sidebar.singleFileMode') : t('sidebar.files')}
            <span className="text-[10px] font-normal tabular-nums text-muted-foreground/70">
              {fileCount}
            </span>
          </SidebarGroupLabel>
          <TooltipProvider delayDuration={180}>
            <div className="flex shrink-0 items-center gap-1">
              <ExplorerToolbarButton
                label={t('sidebar.search')}
                icon={Search}
                expanded={filterOpen}
                controls={filterId}
                buttonRef={filterButtonRef}
                onClick={() => {
                  setFilterOpen(!filterOpen)
                  setFilter('')
                }}
              />
              {!readonlyTree && (
                <>
                  <ExplorerToolbarButton
                    label={t('sidebar.newFile')}
                    icon={FilePlus2}
                    onClick={() => {
                      setRootCreateKind('file')
                      setRootCreateOpen(true)
                    }}
                  />
                  <ExplorerToolbarButton
                    label={t('sidebar.newFolder')}
                    icon={FolderPlus}
                    onClick={() => {
                      setRootCreateKind('folder')
                      setRootCreateOpen(true)
                    }}
                  />
                </>
              )}
            </div>
          </TooltipProvider>
        </div>
        <SidebarGroupContent className="flex min-h-0 flex-1 flex-col gap-2">
          {readonlyTree && (
            <div className="px-2 py-1 text-xs leading-5 text-muted-foreground">
              {t('sidebar.singleFileReadonlyHint')}
            </div>
          )}
          {filterOpen && (
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id={filterId}
                ref={filterInputRef}
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder={t('sidebar.search')}
                aria-label={t('sidebar.search')}
                className="h-8 border-sidebar-border bg-transparent pl-7 text-xs shadow-none"
                onKeyDown={(event) => {
                  if (event.key !== 'Escape') return
                  event.preventDefault()
                  event.stopPropagation()
                  setFilter('')
                  setFilterOpen(false)
                  filterButtonRef.current?.focus()
                }}
              />
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-hidden pr-1">
            {!hasVisibleFiles ? (
              <AppEmptyState
                compact
                className="min-h-28 flex-none border-0 bg-transparent px-3 py-4 md:p-4"
                icon={emptyIcon}
                mediaClassName="mb-0 size-8 bg-transparent text-muted-foreground [&_svg:not([class*='size-'])]:size-4"
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
        open={rootCreateOpen}
        title={rootCreateTitle}
        description={rootCreateDescription}
        defaultValue=""
        confirmLabel={rootCreateTitle}
        onOpenChange={(open) => {
          if (!open) setRootCreateOpen(false)
        }}
        onSubmit={handleRootCreate}
      />
    </div>
  )
}

export default SidebarExplorerPanel
