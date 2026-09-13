import { AutoSizer } from 'react-virtualized-auto-sizer'
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu'
import { FileTreeBlankContextMenu } from '@/components/file-tree/FileTreeBlankContextMenu'
import { FileConfirmDialog, FileNameDialog } from '@/components/file-tree/FileOperationDialogs'
import type { SidebarFileTreeProps } from '@/components/file-tree/types'
import { useSidebarFileTreeState } from '@/components/file-tree/useSidebarFileTreeState'
import { Tree } from 'react-arborist'

const SidebarFileTree = (props: SidebarFileTreeProps) => {
  const {
    treeRef,
    dndRootElement,
    setTreeContainerRef,
    createDialogOpen,
    deleteDialogOpen,
    createDialogTitle,
    createDialogDescription,
    createDialogDefaultValue,
    deleteDialogDescription,
    nodes,
    searchTerm,
    handleActivate,
    handleMove,
    handleRename,
    handleCreateSubmit,
    handleDeleteConfirm,
    closeCreateDialog,
    closeDeleteDialog,
    handleKeyDownCapture,
    requestCreateNode,
    disableDrop,
    renderNode,
    readonlyTree,
  } = useSidebarFileTreeState(props)

  const restoreTreeFocus = (event: Event) => {
    const tree = dndRootElement?.querySelector<HTMLElement>('[role="tree"]')
    if (!tree) return
    event.preventDefault()
    tree.focus({ preventScroll: true })
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
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
                    <Tree
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
                      selection={props.activePath ?? undefined}
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
        </ContextMenuTrigger>
        <FileTreeBlankContextMenu
          labels={props.labels}
          readonlyTree={readonlyTree}
          onRequestCreate={(kind) => requestCreateNode(null, kind)}
        />
      </ContextMenu>
      <FileNameDialog
        open={createDialogOpen}
        title={createDialogTitle}
        description={createDialogDescription}
        defaultValue={createDialogDefaultValue}
        confirmLabel={createDialogTitle}
        onCloseAutoFocus={restoreTreeFocus}
        onOpenChange={closeCreateDialog}
        onSubmit={handleCreateSubmit}
      />
      <FileConfirmDialog
        open={deleteDialogOpen}
        title={props.labels.delete}
        description={deleteDialogDescription}
        confirmLabel={props.labels.delete}
        onCloseAutoFocus={restoreTreeFocus}
        onOpenChange={closeDeleteDialog}
        onConfirm={handleDeleteConfirm}
      />
    </>
  )
}

export default SidebarFileTree
