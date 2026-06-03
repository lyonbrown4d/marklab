import { useCallback, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import {
  Tree,
  type MoveHandler,
  type NodeApi,
  type NodeRendererProps,
  type RenameHandler,
  type TreeApi,
} from 'react-arborist'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import { FileConfirmDialog, FileNameDialog } from '@/components/file-tree/FileOperationDialogs'
import { FileTreeNodeRenderer } from '@/components/file-tree/FileTreeNodeRenderer'
import {
  appendChildPath,
  getCreateParentPath,
  renamePath,
} from '@/components/file-tree/fileTreeActions'
import type { SidebarFileTreeProps } from '@/components/file-tree/types'
import type { FileTreeNode } from '@/logic/fileTree'

export type { ContextLabels } from '@/components/file-tree/types'

type CreateDialogRequest = {
  kind: 'file' | 'folder'
  parentPath: string
}

type DeleteDialogRequest = {
  name: string
  path: string
  type: FileTreeNode['type']
}

const SidebarFileTree = ({
  activePath,
  labels,
  nodes,
  onCreateFile,
  onCreateFolder,
  onDeletePath,
  onInspectPath,
  onOpenFile,
  onOpenFileView,
  onRenamePath,
  onMovePath,
  readonlyTree,
  searchTerm,
}: SidebarFileTreeProps) => {
  const treeRef = useRef<TreeApi<FileTreeNode> | undefined>(undefined)
  const [dndRootElement, setDndRootElement] = useState<HTMLDivElement | null>(null)
  const [createRequest, setCreateRequest] = useState<CreateDialogRequest | null>(null)
  const [deleteRequest, setDeleteRequest] = useState<DeleteDialogRequest | null>(null)
  const setTreeContainerRef = useCallback((element: HTMLDivElement | null) => {
    setDndRootElement(element)
  }, [])
  const createDialogTitle = createRequest?.kind === 'file' ? labels.newFile : labels.newFolder
  const createDialogDescription =
    createRequest?.kind === 'file' ? labels.newFilePrompt : labels.newFolderPrompt
  const createDialogDefaultValue =
    createRequest?.kind === 'file'
      ? 'Untitled.md'
      : createRequest?.kind === 'folder'
        ? 'folder'
        : ''
  const deleteDialogDescription =
    deleteRequest?.type === 'folder'
      ? labels.deleteFolderConfirm.replace('{name}', deleteRequest.name)
      : labels.deleteConfirm.replace('{name}', deleteRequest?.name ?? '')

  const getActiveNode = useCallback(() => {
    const tree = treeRef.current
    return tree?.focusedNode ?? tree?.mostRecentNode ?? tree?.selectedNodes[0] ?? null
  }, [])

  const handleActivate = useCallback(
    (node: NodeApi<FileTreeNode>) => {
      if (node.data.type === 'file') {
        onOpenFile(node.data.path)
      }
    },
    [onOpenFile],
  )

  const handleMove = useCallback<MoveHandler<FileTreeNode>>(
    async ({ dragNodes, parentNode }) => {
      if (readonlyTree) return
      const targetParentPath = parentNode?.isRoot ? '' : (parentNode?.data.path ?? '')
      for (const dragNode of dragNodes) {
        const nextPath = appendChildPath(targetParentPath, dragNode.data.name)
        if (nextPath && nextPath !== dragNode.data.path) {
          await onMovePath(dragNode.data.path, nextPath)
        }
      }
    },
    [onMovePath, readonlyTree],
  )

  const handleRename = useCallback<RenameHandler<FileTreeNode>>(
    async ({ name, node }) => {
      if (readonlyTree) return
      const nextName = name.trim()
      if (!nextName || nextName === node.data.name || nextName.includes('/')) return
      await onRenamePath(node.data.path, renamePath(node.data.path, nextName))
    },
    [onRenamePath, readonlyTree],
  )

  const requestDeleteNode = useCallback(
    (node: NodeApi<FileTreeNode> | null) => {
      if (!node || node.isRoot || readonlyTree) return
      setDeleteRequest({
        name: node.data.name,
        path: node.data.path,
        type: node.data.type,
      })
    },
    [readonlyTree],
  )

  const requestCreateNode = useCallback(
    (node: NodeApi<FileTreeNode> | null, kind: 'file' | 'folder') => {
      if (readonlyTree) return
      setCreateRequest({
        kind,
        parentPath: getCreateParentPath(node),
      })
    },
    [readonlyTree],
  )

  const handleCreateSubmit = useCallback(
    (name: string) => {
      if (!createRequest) return
      const nextPath = appendChildPath(createRequest.parentPath, name)
      if (createRequest.kind === 'file') onCreateFile(nextPath)
      else onCreateFolder(nextPath)
      setCreateRequest(null)
    },
    [createRequest, onCreateFile, onCreateFolder],
  )

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteRequest) return
    onDeletePath(deleteRequest.path)
    setDeleteRequest(null)
  }, [deleteRequest, onDeletePath])

  const closeCreateDialog = useCallback((open: boolean) => {
    if (!open) setCreateRequest(null)
  }, [])

  const closeDeleteDialog = useCallback((open: boolean) => {
    if (!open) setDeleteRequest(null)
  }, [])

  const handleKeyDownCapture = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.defaultPrevented) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable="true"]')) return

      const node = getActiveNode()
      const isCommand = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()

      if (isCommand && key === 'n') {
        event.preventDefault()
        event.stopPropagation()
        requestCreateNode(node, event.shiftKey ? 'folder' : 'file')
        return
      }

      if (event.key === 'F2') {
        if (!node || node.isRoot || readonlyTree) return
        event.preventDefault()
        event.stopPropagation()
        void node.edit()
        return
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        event.stopPropagation()
        requestDeleteNode(node)
        return
      }

      if (event.key === 'Enter') {
        if (!node || node.isRoot) return
        event.preventDefault()
        event.stopPropagation()
        if (node.data.type === 'folder') {
          node.toggle()
          return
        }
        onOpenFile(node.data.path)
      }
    },
    [getActiveNode, onOpenFile, readonlyTree, requestCreateNode, requestDeleteNode],
  )

  const disableDrop = useCallback(
    ({
      dragNodes,
      parentNode,
    }: {
      parentNode: NodeApi<FileTreeNode>
      dragNodes: NodeApi<FileTreeNode>[]
      index: number
    }) => {
      if (readonlyTree) return true
      if (!parentNode.isRoot && parentNode.data.type !== 'folder') return true
      const targetParentPath = parentNode.isRoot ? '' : parentNode.data.path
      return dragNodes.some(
        (dragNode) =>
          targetParentPath === dragNode.data.path ||
          targetParentPath.startsWith(`${dragNode.data.path}/`),
      )
    },
    [readonlyTree],
  )

  const renderNode = useCallback(
    (props: NodeRendererProps<FileTreeNode>) => (
      <FileTreeNodeRenderer
        {...props}
        activePath={activePath}
        labels={labels}
        onInspectPath={onInspectPath}
        onOpenFile={onOpenFile}
        onOpenFileView={onOpenFileView}
        onRequestCreate={requestCreateNode}
        onRequestDelete={requestDeleteNode}
        readonlyTree={readonlyTree}
      />
    ),
    [
      activePath,
      labels,
      onInspectPath,
      onOpenFile,
      onOpenFileView,
      requestCreateNode,
      requestDeleteNode,
      readonlyTree,
    ],
  )

  return (
    <>
      <div
        ref={setTreeContainerRef}
        className="h-full min-h-0 w-full overflow-hidden"
        onKeyDownCapture={handleKeyDownCapture}
      >
        {dndRootElement && (
          <AutoSizer
            className="h-full w-full"
            renderProp={({ height, width }) => {
              const treeHeight = height ?? 0
              const treeWidth = width ?? 0
              if (treeHeight <= 0 || treeWidth <= 0) return null

              return (
                <Tree<FileTreeNode>
                  ref={treeRef}
                  data={nodes}
                  idAccessor="path"
                  childrenAccessor="children"
                  rowHeight={28}
                  indent={13}
                  overscanCount={8}
                  height={treeHeight}
                  width={treeWidth}
                  openByDefault={false}
                  selection={activePath ?? undefined}
                  searchTerm={searchTerm}
                  searchMatch={(treeNode, term) =>
                    treeNode.data.name.toLowerCase().includes(term.toLowerCase())
                  }
                  dndRootElement={dndRootElement}
                  disableDrag={readonlyTree}
                  disableDrop={disableDrop}
                  disableEdit={readonlyTree}
                  disableMultiSelection
                  className="outline-none"
                  onActivate={handleActivate}
                  onMove={handleMove}
                  onRename={handleRename}
                >
                  {renderNode}
                </Tree>
              )
            }}
          />
        )}
      </div>
      <FileNameDialog
        open={createRequest !== null}
        title={createDialogTitle}
        description={createDialogDescription}
        defaultValue={createDialogDefaultValue}
        confirmLabel={createDialogTitle}
        onOpenChange={closeCreateDialog}
        onSubmit={handleCreateSubmit}
      />
      <FileConfirmDialog
        open={deleteRequest !== null}
        title={labels.delete}
        description={deleteDialogDescription}
        confirmLabel={labels.delete}
        onOpenChange={closeDeleteDialog}
        onConfirm={handleDeleteConfirm}
      />
    </>
  )
}

export default SidebarFileTree
