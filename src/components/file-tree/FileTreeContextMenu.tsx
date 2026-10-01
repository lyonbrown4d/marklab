import { useRef } from 'react'
import type { NodeApi } from 'react-arborist'
import {
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  ExternalLink,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderX,
  Info,
  Link2,
  Pencil,
  ScanSearch,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { ContextMenuContent, ContextMenuSeparator } from '@/components/ui/context-menu'
import { FileTreeContextMenuItem as MenuItem } from '@/components/file-tree/FileTreeContextMenuItem'
import {
  menuItemStyles,
  menuSeparatorStyles,
  menuSurfaceStyles,
} from '@/components/overlay/overlayStyles'
import {
  copyAbsolutePath,
  copyText,
  createMarkdownLink,
  openPathInSystem,
  revealPath,
} from '@/components/file-tree/fileTreeActions'
import type { SidebarFileTreeActions } from '@/components/file-tree/types'
import type { FileTreeNode } from '@/logic/fileTree'
import { isPreviewableFilePath } from '@/logic/fileTypes'

type FileTreeContextMenuProps = Omit<
  SidebarFileTreeActions,
  'activePath' | 'onMovePath' | 'onRenamePath' | 'onCreateFile' | 'onCreateFolder' | 'onDeletePath'
> & {
  node: NodeApi<FileTreeNode>
  onRequestCreate: (node: NodeApi<FileTreeNode>, kind: 'file' | 'folder') => void
  onRequestDelete: (node: NodeApi<FileTreeNode>) => void
}

const isApplePlatform =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform)

const shortcut = {
  enter: 'Enter',
  newFile: isApplePlatform ? '⌘N' : 'Ctrl+N',
  newFolder: isApplePlatform ? '⇧⌘N' : 'Shift+Ctrl+N',
  rename: 'F2',
  delete: isApplePlatform ? '⌫' : 'Del',
}

export const FileTreeContextMenu = ({
  labels,
  node,
  onInspectPath,
  onOpenFile,
  onOpenFileView,
  onRequestCreate,
  onRequestDelete,
  readonlyTree,
}: FileTreeContextMenuProps) => {
  const renameRequested = useRef(false)
  const item = node.data
  const isFolder = item.type === 'folder'
  const textViewsAvailable = !isFolder && !isPreviewableFilePath(item.path)
  const hasChildren = isFolder && (item.children?.length ?? 0) > 0
  const HeaderIcon = isFolder
    ? hasChildren
      ? node.isOpen
        ? FolderOpen
        : Folder
      : FolderX
    : FileText

  const runMenuTask = (action: string, task: () => Promise<void>, successLabel?: string) => {
    void task()
      .then(() => {
        if (successLabel) toast.success(successLabel)
      })
      .catch((error) => {
        console.error(`${action} failed`, error)
        toast.error(labels.actionFailed)
      })
  }

  const handleCreateFile = () => {
    if (!isFolder || readonlyTree) return
    onRequestCreate(node, 'file')
  }

  const handleCreateFolder = () => {
    if (!isFolder || readonlyTree) return
    onRequestCreate(node, 'folder')
  }

  const handleDelete = () => {
    if (readonlyTree) return
    onRequestDelete(node)
  }

  return (
    <ContextMenuContent
      alignOffset={-2}
      onClick={(event) => event.stopPropagation()}
      onCloseAutoFocus={(event) => {
        if (!renameRequested.current) return
        renameRequested.current = false
        event.preventDefault()
        runMenuTask('rename path', async () => {
          await node.edit()
        })
      }}
      className={menuSurfaceStyles({ className: 'w-[16rem]' })}
    >
      <div className="flex min-w-0 items-center gap-2 px-2 py-1.5">
        <HeaderIcon className="size-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-foreground">{item.name}</div>
          <div className="truncate text-[10px] text-muted-foreground">{item.path || item.name}</div>
        </div>
      </div>
      <ContextMenuSeparator className={menuSeparatorStyles} />

      {isFolder && hasChildren ? (
        <MenuItem
          className={menuItemStyles()}
          icon={node.isOpen ? ChevronDown : ChevronRight}
          onSelect={() => node.toggle()}
        >
          {node.isOpen ? labels.collapse : labels.expand}
        </MenuItem>
      ) : !isFolder ? (
        <>
          <MenuItem
            className={menuItemStyles()}
            icon={FileText}
            shortcutLabel={shortcut.enter}
            onSelect={() => onOpenFile(item.path)}
          >
            {labels.open}
          </MenuItem>
          {textViewsAvailable ? (
            <>
              <MenuItem
                className={menuItemStyles()}
                icon={Code2}
                onSelect={() => onOpenFileView(item.path, 'source')}
              >
                {labels.openSource}
              </MenuItem>
              <MenuItem
                className={menuItemStyles()}
                icon={ScanSearch}
                onSelect={() => onOpenFileView(item.path, 'graph')}
              >
                {labels.openGraph}
              </MenuItem>
            </>
          ) : null}
        </>
      ) : null}

      {isFolder && hasChildren ? <ContextMenuSeparator className={menuSeparatorStyles} /> : null}

      {isFolder && !hasChildren ? (
        <div className="px-2 pb-1 text-[10px] text-muted-foreground">{item.path || item.name}</div>
      ) : null}

      {isFolder && !readonlyTree ? (
        <>
          <ContextMenuSeparator className={menuSeparatorStyles} />
          <MenuItem
            className={menuItemStyles()}
            icon={FilePlus2}
            shortcutLabel={shortcut.newFile}
            onSelect={handleCreateFile}
          >
            {labels.newFile}
          </MenuItem>
          <MenuItem
            className={menuItemStyles()}
            icon={FolderPlus}
            shortcutLabel={shortcut.newFolder}
            onSelect={handleCreateFolder}
          >
            {labels.newFolder}
          </MenuItem>
        </>
      ) : null}

      <ContextMenuSeparator className={menuSeparatorStyles} />
      <MenuItem
        className={menuItemStyles()}
        icon={ExternalLink}
        onSelect={() => runMenuTask('open path', () => openPathInSystem(item.path))}
      >
        {labels.openInSystem}
      </MenuItem>
      <MenuItem
        className={menuItemStyles()}
        icon={FolderOpen}
        onSelect={() => runMenuTask('reveal path', () => revealPath(item.path))}
      >
        {labels.revealInFolder}
      </MenuItem>
      <MenuItem
        className={menuItemStyles()}
        icon={Copy}
        onSelect={() => runMenuTask('copy path', () => copyText(item.path), labels.copied)}
      >
        {labels.copyPath}
      </MenuItem>
      <MenuItem
        className={menuItemStyles()}
        icon={Copy}
        onSelect={() =>
          runMenuTask('copy absolute path', () => copyAbsolutePath(item.path), labels.copied)
        }
      >
        {labels.copyAbsolutePath}
      </MenuItem>
      {!isFolder ? (
        <MenuItem
          className={menuItemStyles()}
          icon={Link2}
          onSelect={() =>
            runMenuTask(
              'copy markdown link',
              () => copyText(createMarkdownLink(item.path)),
              labels.copied,
            )
          }
        >
          {labels.copyMarkdownLink}
        </MenuItem>
      ) : null}

      <ContextMenuSeparator className={menuSeparatorStyles} />
      {!readonlyTree ? (
        <>
          <MenuItem
            className={menuItemStyles()}
            icon={Pencil}
            shortcutLabel={shortcut.rename}
            onSelect={() => {
              renameRequested.current = true
            }}
          >
            {labels.rename}
          </MenuItem>
          <MenuItem
            className={menuItemStyles({ tone: 'destructive' })}
            destructive
            icon={Trash2}
            shortcutLabel={shortcut.delete}
            onSelect={handleDelete}
          >
            {labels.delete}
          </MenuItem>
          <ContextMenuSeparator className={menuSeparatorStyles} />
        </>
      ) : null}
      <MenuItem className={menuItemStyles()} icon={Info} onSelect={() => onInspectPath(item.path)}>
        {labels.properties}
      </MenuItem>
    </ContextMenuContent>
  )
}
