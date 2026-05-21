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
import { FileTreeNodeRenderer } from '@/components/file-tree/FileTreeNodeRenderer'
import {
  appendChildPath,
  getCreateParentPath,
  renamePath,
} from '@/components/file-tree/fileTreeActions'
import type { SidebarFileTreeProps } from '@/components/file-tree/types'
import type { FileTreeNode } from '@/logic/fileTree'

export type { ContextLabels } from '@/components/file-tree/types'

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

  const handleDeleteNode = useCallback(
    (node: NodeApi<FileTreeNode> | null) => {
      if (!node || node.isRoot || readonlyTree) return
      const message =
        node.data.type === 'folder'
          ? labels.deleteFolderConfirm.replace('{name}', node.data.name)
          : labels.deleteConfirm.replace('{name}', node.data.name)
      if (!window.confirm(message)) return
      onDeletePath(node.data.path)
    },
    [labels.deleteConfirm, labels.deleteFolderConfirm, onDeletePath, readonlyTree],
  )

  const promptCreate = useCallback(
    (node: NodeApi<FileTreeNode> | null, kind: 'file' | 'folder') => {
      if (readonlyTree) return
      const promptLabel = kind === 'file' ? labels.newFilePrompt : labels.newFolderPrompt
      const fallback = kind === 'file' ? 'Untitled.md' : 'folder'
      const name = window.prompt(promptLabel, fallback)?.trim()
      if (!name) return
      const nextPath = appendChildPath(getCreateParentPath(node), name)
      if (kind === 'file') onCreateFile(nextPath)
      else onCreateFolder(nextPath)
    },
    [labels.newFilePrompt, labels.newFolderPrompt, onCreateFile, onCreateFolder, readonlyTree],
  )

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
        promptCreate(node, event.shiftKey ? 'folder' : 'file')
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
        handleDeleteNode(node)
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
    [getActiveNode, handleDeleteNode, onOpenFile, promptCreate, readonlyTree],
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
        onCreateFile={onCreateFile}
        onCreateFolder={onCreateFolder}
        onDeletePath={onDeletePath}
        onInspectPath={onInspectPath}
        onOpenFile={onOpenFile}
        onOpenFileView={onOpenFileView}
        readonlyTree={readonlyTree}
      />
    ),
    [
      activePath,
      labels,
      onCreateFile,
      onCreateFolder,
      onDeletePath,
      onInspectPath,
      onOpenFile,
      onOpenFileView,
      readonlyTree,
    ],
  )

  return (
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
  )
}

export default SidebarFileTree
