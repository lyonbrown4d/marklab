import { useState, type ComponentProps, type ComponentType, type ReactNode } from 'react'
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
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu'
import { cn } from '@/lib/utils'
import {
  copyAbsolutePath,
  copyText,
  createMarkdownLink,
  openPathInSystem,
  revealPath,
} from '@/components/file-tree/fileTreeActions'
import type { SidebarFileTreeActions } from '@/components/file-tree/types'
import type { FileTreeNode } from '@/logic/fileTree'

type IconComponent = ComponentType<{ className?: string }>

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

const MenuShortcut = ({ children }: { children: ReactNode }) => (
  <span className="ml-3 rounded border border-border/80 bg-muted/70 px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground transition-colors group-data-[active=true]/file-tree-menu:border-accent-foreground/20 group-data-[active=true]/file-tree-menu:bg-accent-foreground/10 group-data-[active=true]/file-tree-menu:text-accent-foreground group-data-[highlighted]/file-tree-menu:border-accent-foreground/20 group-data-[highlighted]/file-tree-menu:bg-accent-foreground/10 group-data-[highlighted]/file-tree-menu:text-accent-foreground">
    {children}
  </span>
)

const MenuItem = ({
  children,
  destructive,
  icon: Icon,
  shortcutLabel,
  ...props
}: ComponentProps<typeof ContextMenuItem> & {
  icon: IconComponent
  shortcutLabel?: ReactNode
  destructive?: boolean
}) => {
  const [active, setActive] = useState(false)
  const activeStyle = active
    ? {
        backgroundColor: destructive ? 'hsl(var(--destructive) / 0.12)' : 'hsl(var(--accent))',
        color: destructive ? 'hsl(var(--destructive))' : 'hsl(var(--accent-foreground))',
      }
    : undefined

  return (
    <ContextMenuItem
      {...props}
      data-active={active ? 'true' : undefined}
      style={{ ...props.style, ...activeStyle }}
      onBlur={(event) => {
        setActive(false)
        props.onBlur?.(event)
      }}
      onFocus={(event) => {
        setActive(true)
        props.onFocus?.(event)
      }}
      onMouseEnter={(event) => {
        setActive(true)
        props.onMouseEnter?.(event)
      }}
      onMouseLeave={(event) => {
        setActive(false)
        props.onMouseLeave?.(event)
      }}
      onPointerMove={(event) => {
        setActive(true)
        props.onPointerMove?.(event)
      }}
      className={cn(
        'group/file-tree-menu relative gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
        'before:absolute before:left-0 before:top-1 before:h-5 before:w-0.5 before:rounded-full before:bg-transparent before:transition-colors',
        'hover:bg-accent hover:text-accent-foreground hover:before:bg-primary',
        'data-[active=true]:before:bg-primary data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[highlighted]:before:bg-primary',
        destructive &&
          'text-destructive hover:bg-destructive/10 hover:text-destructive hover:before:bg-destructive data-[active=true]:before:bg-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive data-[highlighted]:before:bg-destructive',
        props.className,
      )}
    >
      <Icon
        className={cn(
          'h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover/file-tree-menu:text-accent-foreground group-data-[active=true]/file-tree-menu:text-accent-foreground group-data-[highlighted]/file-tree-menu:text-accent-foreground',
          destructive &&
            'text-destructive/80 group-hover/file-tree-menu:text-destructive group-data-[active=true]/file-tree-menu:text-destructive group-data-[highlighted]/file-tree-menu:text-destructive',
        )}
      />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcutLabel ? <MenuShortcut>{shortcutLabel}</MenuShortcut> : null}
    </ContextMenuItem>
  )
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
  const item = node.data
  const isFolder = item.type === 'folder'
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
      className="w-[16rem] rounded-lg border border-border/90 bg-popover p-1.5 shadow-xl"
    >
      <div className="flex min-w-0 items-center gap-2 px-2 py-1.5">
        <HeaderIcon className="h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-foreground">{item.name}</div>
          <div className="truncate text-[10px] text-muted-foreground">{item.path || item.name}</div>
        </div>
      </div>
      <ContextMenuSeparator />

      {isFolder && hasChildren ? (
        <MenuItem icon={node.isOpen ? ChevronDown : ChevronRight} onSelect={() => node.toggle()}>
          {node.isOpen ? labels.collapse : labels.expand}
        </MenuItem>
      ) : !isFolder ? (
        <>
          <MenuItem
            icon={FileText}
            shortcutLabel={shortcut.enter}
            onSelect={() => onOpenFile(item.path)}
          >
            {labels.open}
          </MenuItem>
          <MenuItem icon={Code2} onSelect={() => onOpenFileView(item.path, 'source')}>
            {labels.openSource}
          </MenuItem>
          <MenuItem icon={ScanSearch} onSelect={() => onOpenFileView(item.path, 'graph')}>
            {labels.openGraph}
          </MenuItem>
        </>
      ) : null}

      {isFolder && hasChildren ? <ContextMenuSeparator /> : null}

      {isFolder && !hasChildren ? (
        <div className="px-2 pb-1 text-[10px] text-muted-foreground">{item.path || item.name}</div>
      ) : null}

      {isFolder && !readonlyTree ? (
        <>
          <ContextMenuSeparator />
          <MenuItem icon={FilePlus2} shortcutLabel={shortcut.newFile} onSelect={handleCreateFile}>
            {labels.newFile}
          </MenuItem>
          <MenuItem
            icon={FolderPlus}
            shortcutLabel={shortcut.newFolder}
            onSelect={handleCreateFolder}
          >
            {labels.newFolder}
          </MenuItem>
        </>
      ) : null}

      <ContextMenuSeparator />
      <MenuItem
        icon={ExternalLink}
        onSelect={() => runMenuTask('open path', () => openPathInSystem(item.path))}
      >
        {labels.openInSystem}
      </MenuItem>
      <MenuItem
        icon={FolderOpen}
        onSelect={() => runMenuTask('reveal path', () => revealPath(item.path))}
      >
        {labels.revealInFolder}
      </MenuItem>
      <MenuItem
        icon={Copy}
        onSelect={() => runMenuTask('copy path', () => copyText(item.path), labels.copied)}
      >
        {labels.copyPath}
      </MenuItem>
      <MenuItem
        icon={Copy}
        onSelect={() =>
          runMenuTask('copy absolute path', () => copyAbsolutePath(item.path), labels.copied)
        }
      >
        {labels.copyAbsolutePath}
      </MenuItem>
      {!isFolder ? (
        <MenuItem
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

      <ContextMenuSeparator />
      {!readonlyTree ? (
        <>
          <MenuItem icon={Pencil} shortcutLabel={shortcut.rename} onSelect={() => void node.edit()}>
            {labels.rename}
          </MenuItem>
          <MenuItem
            destructive
            icon={Trash2}
            shortcutLabel={shortcut.delete}
            onSelect={handleDelete}
          >
            {labels.delete}
          </MenuItem>
          <ContextMenuSeparator />
        </>
      ) : null}
      <MenuItem icon={Info} onSelect={() => onInspectPath(item.path)}>
        {labels.properties}
      </MenuItem>
    </ContextMenuContent>
  )
}
