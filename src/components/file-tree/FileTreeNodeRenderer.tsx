import type React from 'react'
import type { NodeRendererProps } from 'react-arborist'
import { ChevronRight, FileText, Folder, FolderOpen, FolderX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu'
import { FileTreeContextMenu } from '@/components/file-tree/FileTreeContextMenu'
import { InlineRenameField } from '@/components/file-tree/InlineRenameField'
import type { SidebarFileTreeActions } from '@/components/file-tree/types'
import { createFileTreeDragPayload, MARKO_FILE_TREE_ITEM_MIME } from '@/logic/fileDragPayload'
import type { FileTreeNode } from '@/logic/fileTree'

type FileTreeNodeRendererProps = NodeRendererProps<FileTreeNode> &
  Omit<
    SidebarFileTreeActions,
    'onMovePath' | 'onRenamePath' | 'onCreateFile' | 'onCreateFolder' | 'onDeletePath'
  > & {
    onRequestCreate: (
      node: NodeRendererProps<FileTreeNode>['node'],
      kind: 'file' | 'folder',
    ) => void
    onRequestDelete: (node: NodeRendererProps<FileTreeNode>['node']) => void
  }

const imageFilePattern = /\.(apng|avif|bmp|gif|jpe?g|png|svg|webp)$/i

export const FileTreeNodeRenderer = ({
  activePath,
  dragHandle,
  labels,
  node,
  onInspectPath,
  onOpenFile,
  onOpenFileView,
  onRequestCreate,
  onRequestDelete,
  readonlyTree,
  style,
}: FileTreeNodeRendererProps) => {
  const item = node.data
  const isFolder = item.type === 'folder'
  const isActive = item.type === 'file' && item.path === activePath
  const isImageFile = item.type === 'file' && imageFilePattern.test(item.name)
  const hasChildren = isFolder && (item.children?.length ?? 0) > 0

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    node.focus()
    node.select()
    if (isFolder) {
      if (hasChildren) node.toggle()
      return
    }
    onOpenFile(item.path)
  }

  const handleDragStart = (event: React.DragEvent<HTMLElement>) => {
    if (!isImageFile) return
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData(
      MARKO_FILE_TREE_ITEM_MIME,
      createFileTreeDragPayload({
        kind: 'file',
        name: item.name,
        path: item.path,
      }),
    )
    event.dataTransfer.setData('text/plain', item.path)
  }

  return (
    <div
      ref={dragHandle}
      className="min-w-0"
      style={{ ...style, boxSizing: 'border-box' }}
      onDragStart={handleDragStart}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={`group relative h-[28px] w-full justify-start rounded-md px-2 text-xs transition-all ${
              isActive
                ? 'bg-accent text-accent-foreground before:absolute before:left-0 before:top-1 before:h-5 before:w-0.5 before:rounded-full before:bg-primary'
                : 'text-sidebar-foreground/85 hover:bg-sidebar-accent'
            }`}
            aria-current={isActive ? 'page' : undefined}
            draggable={isImageFile}
            onClick={handleClick}
            onContextMenu={() => {
              node.focus()
              node.select()
            }}
            onDragStart={handleDragStart}
          >
            {isFolder ? (
              <>
                {hasChildren ? (
                  <ChevronRight
                    className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
                      node.isOpen ? 'rotate-90' : ''
                    }`}
                  />
                ) : (
                  <span className="w-3.5" />
                )}
                {hasChildren && node.isOpen ? (
                  <FolderOpen className="h-4 w-4 text-primary" />
                ) : hasChildren ? (
                  <Folder className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <FolderX className="h-4 w-4 text-muted-foreground/70" />
                )}
              </>
            ) : (
              <>
                <span className="w-3.5" />
                <FileText className="h-4 w-4 text-muted-foreground" />
              </>
            )}
            {node.isEditing ? (
              <InlineRenameField node={node} />
            ) : (
              <span className="ml-1 truncate text-left">{item.name}</span>
            )}
          </Button>
        </ContextMenuTrigger>
        <FileTreeContextMenu
          labels={labels}
          node={node}
          onInspectPath={onInspectPath}
          onOpenFile={onOpenFile}
          onOpenFileView={onOpenFileView}
          onRequestCreate={onRequestCreate}
          onRequestDelete={onRequestDelete}
          readonlyTree={readonlyTree}
        />
      </ContextMenu>
    </div>
  )
}
