import { useCallback, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type {
  MoveHandler,
  NodeApi,
  NodeRendererProps,
  RenameHandler,
  TreeApi,
} from 'react-arborist'
import { toast } from 'sonner'
import {
  appendChildPath,
  getCreateParentPath,
  renamePath,
} from '@/components/file-tree/fileTreeActions'
import { FileTreeNodeRenderer } from '@/components/file-tree/FileTreeNodeRenderer'
import type { SidebarFileTreeProps } from '@/components/file-tree/types'
import type { FileTreeNode } from '@/logic/fileTree'

type CreateDialogRequest = {
  kind: 'file' | 'folder'
  parentPath: string
}

type DeleteDialogRequest = {
  name: string
  path: string
  type: FileTreeNode['type']
}

export const useSidebarFileTreeState = ({
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

  const setTreeContainerRef = useCallback((element: HTMLDivElement | null) => {
    setDndRootElement(element)
  }, [])
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
          try {
            await onMovePath(dragNode.data.path, nextPath)
          } catch (error) {
            toast.error(labels.actionFailed, {
              description: String(error),
            })
            break
          }
        }
      }
    },
    [onMovePath, readonlyTree, labels.actionFailed],
  )

  const handleRename = useCallback<RenameHandler<FileTreeNode>>(
    async ({ name, node }) => {
      if (readonlyTree) return
      const nextName = name.trim()
      if (!nextName || nextName === node.data.name || nextName.includes('/')) return
      try {
        await onRenamePath(node.data.path, renamePath(node.data.path, nextName))
      } catch (error) {
        toast.error(labels.actionFailed, {
          description: String(error),
        })
      }
    },
    [onRenamePath, readonlyTree, labels.actionFailed],
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
      try {
        if (createRequest.kind === 'file') {
          onCreateFile(nextPath)
        } else {
          onCreateFolder(nextPath)
        }
        setCreateRequest(null)
      } catch (error) {
        toast.error(labels.actionFailed, {
          description: String(error),
        })
      }
    },
    [createRequest, labels.actionFailed, onCreateFile, onCreateFolder],
  )

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteRequest) return
    try {
      onDeletePath(deleteRequest.path)
      setDeleteRequest(null)
    } catch (error) {
      toast.error(labels.actionFailed, {
        description: String(error),
      })
    }
  }, [deleteRequest, labels.actionFailed, onDeletePath])

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
      dragNodes: NodeApi<FileTreeNode>[]
      parentNode: NodeApi<FileTreeNode>
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

  return {
    treeRef,
    dndRootElement,
    setTreeContainerRef,
    createRequest,
    deleteRequest,
    createDialogTitle,
    createDialogDescription,
    createDialogDefaultValue,
    deleteDialogDescription,
    nodes,
    searchTerm,
    handleActivate,
    handleMove,
    handleRename,
    requestDeleteNode,
    requestCreateNode,
    handleCreateSubmit,
    handleDeleteConfirm,
    closeCreateDialog,
    closeDeleteDialog,
    handleKeyDownCapture,
    disableDrop,
    renderNode,
    readonlyTree,
  }
}
