import { useEffect, useMemo, useRef, useState } from 'react'
import { FilePlus2, FolderPlus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from '@/components/ui/sidebar'
import SidebarFileTree from '@/components/SidebarFileTree'
import type { SidebarExplorerPanelProps } from '@/components/sidebarPanelTypes'
import { useI18n } from '@/i18n/useI18n'
import { filterTree } from '@/logic/fileTree'

const createRootEntry = (promptLabel: string, action: (path: string) => void) => {
  const value = window.prompt(promptLabel)
  const path = value?.trim()
  if (!path) return
  action(path)
}

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
  const filterInputRef = useRef<HTMLInputElement | null>(null)
  const readonlyTree = rootKind === 'single'
  const hasVisibleFiles = useMemo(() => filterTree(fileTree, filter).length > 0, [fileTree, filter])
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

  useEffect(() => {
    if (focusFileFilterRequest === 0) return
    filterInputRef.current?.focus()
    filterInputRef.current?.select()
  }, [focusFileFilterRequest])

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      <SidebarGroup className="sidebar-section min-h-0 flex-1 rounded-md p-1">
        <SidebarGroupLabel className="sidebar-section-header flex h-8 items-center justify-between px-2 text-[11px] uppercase">
          <span>{t('sidebar.files')}</span>
          <div className="flex items-center gap-1">
            <Badge variant="secondary" className="rounded px-1.5 py-0">
              {fileCount}
            </Badge>
            {!readonlyTree && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 rounded-md"
                  aria-label={t('sidebar.newFile')}
                  onClick={() => createRootEntry(labels.newFilePrompt, onCreateFile)}
                >
                  <FilePlus2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 rounded-md"
                  aria-label={t('sidebar.newFolder')}
                  onClick={() => createRootEntry(labels.newFolderPrompt, onCreateFolder)}
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </SidebarGroupLabel>
        <SidebarGroupContent className="flex min-h-0 flex-1 flex-col gap-2">
          <Input
            ref={filterInputRef}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={t('sidebar.search')}
            className="h-7 rounded-md border-sidebar-border bg-background/70 text-xs shadow-sm"
          />
          <Separator className="bg-sidebar-border/70" />
          <div className="min-h-0 flex-1 overflow-hidden pr-1">
            {!hasVisibleFiles ? (
              <div className="px-1 text-xs text-muted-foreground">
                {t('sidebar.noProjectLoaded')}
              </div>
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
    </div>
  )
}

export default SidebarExplorerPanel
