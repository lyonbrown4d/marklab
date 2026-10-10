import { useDraggable, useDropLine } from '@platejs/dnd'
import { useBlockSelected } from '@platejs/selection/react'
import { GripVertical } from 'lucide-react'
import type { TElement } from 'platejs'
import {
  useEditorRef,
  type PlateEditor,
  type PlateElementProps,
  type RenderNodeWrapper,
} from 'platejs/react'
import { useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import {
  handlePlateBlockMoveShortcut,
  handlePlateBlockSelectionShortcut,
  selectBlockFromHandle,
  setBlockSelectionTarget,
} from '@/components/plate/selection/plateBlockSelection'
import i18n from '@/i18n/setup'
import { BlockActionMenu } from '@/components/plate/nodes/BlockActionMenu'
import {
  getBlockActionAvailability,
  isBlockClipboardAction,
  runBlockAction,
  type BlockMenuAction,
} from '@/components/plate/nodes/blockActions'
import { serializePlateBlockClipboard } from '@/components/plate/plateClipboardSerialization'
import { writeClipboardContent, writeClipboardText } from '@/runtime/clipboard'

const DRAG_HANDLE_SELECTOR = '[data-block-drag-handle="true"]'

const getHandleNavigationRoot = (handle: HTMLButtonElement) =>
  handle.closest('[data-plate-editor-shell="true"], [data-slate-editor="true"]') ??
  handle.ownerDocument

const activateRovingHandle = (handle: HTMLButtonElement) => {
  const handles =
    getHandleNavigationRoot(handle).querySelectorAll<HTMLButtonElement>(DRAG_HANDLE_SELECTOR)
  handles.forEach((candidate) => {
    candidate.tabIndex = candidate === handle ? 0 : -1
  })
}

const restoreHandleFocus = (editor: PlateEditor, element: TElement) => {
  queueMicrotask(() => {
    const block = editor.api.toDOMNode(element)
    const handle = block?.parentElement?.querySelector<HTMLButtonElement>(DRAG_HANDLE_SELECTOR)
    if (!handle) return
    activateRovingHandle(handle)
    handle.focus()
  })
}

const focusAdjacentHandle = (handle: HTMLButtonElement, direction: 'next' | 'previous') => {
  const handles = [
    ...getHandleNavigationRoot(handle).querySelectorAll<HTMLButtonElement>(DRAG_HANDLE_SELECTOR),
  ]
  const currentIndex = handles.indexOf(handle)
  const offset = direction === 'previous' ? -1 : 1
  const target = handles[currentIndex + offset]
  if (!target) return false
  activateRovingHandle(target)
  target.focus()
  return true
}

export const BlockDraggable = ({ children, element }: PlateElementProps) => {
  const editor = useEditorRef()
  const [menuOpen, setMenuOpen] = useState(false)
  const draggedRef = useRef(false)
  const handleElementRef = useRef<HTMLButtonElement | null>(null)
  const id = element.id as string
  const path = editor.api.findPath(element)
  const initialTabIndex = path?.length === 1 && path[0] === 0 ? 0 : -1
  const isSelected = useBlockSelected(id) as boolean
  const { dropLine } = useDropLine({ id: element.id as string, orientation: 'vertical' })
  const { handleRef, isDragging, nodeRef } = useDraggable({
    element,
    orientation: 'vertical',
  })
  const availability = getBlockActionAvailability(editor, element)

  const openMenu = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    if (!draggedRef.current) setMenuOpen(true)
  }

  const handleAction = (action: BlockMenuAction) => {
    if (isBlockClipboardAction(action)) {
      const content = serializePlateBlockClipboard(editor, element)
      const write =
        action.kind === 'copyAsMarkdown'
          ? writeClipboardText(content.markdown)
          : writeClipboardContent(content)
      setMenuOpen(false)
      if (action.kind === 'cut') {
        void write
          .then(() => {
            const focusTarget = runBlockAction(editor, element, { kind: 'delete' })
            if (focusTarget) {
              setBlockSelectionTarget(editor, focusTarget)
              restoreHandleFocus(editor, focusTarget)
            }
          })
          .catch(() => undefined)
      } else {
        void write.catch(() => undefined)
      }
      return
    }
    const focusTarget = runBlockAction(editor, element, action)
    setMenuOpen(false)
    if (focusTarget) {
      setBlockSelectionTarget(editor, focusTarget)
      restoreHandleFocus(editor, focusTarget)
    }
  }

  const handleDragEnd = () => {
    queueMicrotask(() => {
      draggedRef.current = false
    })
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (
      event.key === 'Enter' &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey
    ) {
      event.preventDefault()
      event.stopPropagation()
      setMenuOpen(true)
      return
    }
    if (handlePlateBlockSelectionShortcut(editor, event, id)) {
      restoreHandleFocus(editor, element)
      return
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    if (handlePlateBlockMoveShortcut(editor, event, id)) {
      restoreHandleFocus(editor, element)
      return
    }
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    event.preventDefault()
    event.stopPropagation()
    focusAdjacentHandle(event.currentTarget, event.key === 'ArrowUp' ? 'previous' : 'next')
  }

  return (
    <div
      className={cn(
        'plate-block-draggable group/block relative rounded-md pl-8 transition-colors duration-150 motion-reduce:transition-none',
        isSelected && 'bg-primary/[0.07] ring-1 ring-inset ring-primary/35',
        isDragging && 'opacity-50',
      )}
      data-block-drag-wrapper="true"
      data-block-id={id}
      data-block-selected={isSelected ? 'true' : 'false'}
      ref={nodeRef}
    >
      <DropdownMenu
        open={menuOpen}
        onOpenChange={(open) => {
          if (open) return
          setMenuOpen(false)
          queueMicrotask(() => {
            const handle = handleElementRef.current
            if (!handle?.isConnected) return
            activateRovingHandle(handle)
            handle.focus()
          })
        }}
      >
        <DropdownMenuTrigger asChild>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-1 size-7"
            tabIndex={-1}
          />
        </DropdownMenuTrigger>
        <Button
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-keyshortcuts="Enter Space Control+Space Meta+Space Shift+Space ArrowUp ArrowDown Alt+ArrowUp Alt+ArrowDown"
          aria-label={i18n.t('plate.blockDrag.moveLabel')}
          aria-pressed={isSelected}
          className={cn(
            'group/handle pointer-events-auto absolute left-0 top-1 z-10 size-7 cursor-grab p-0 text-muted-foreground shadow-none',
            'active:cursor-grabbing',
            isSelected && 'bg-primary/10 text-primary',
          )}
          contentEditable={false}
          data-block-id={id}
          data-block-drag-handle="true"
          data-plate-prevent-unselect="true"
          onClick={openMenu}
          onDragEnd={handleDragEnd}
          onDragStart={() => {
            draggedRef.current = true
          }}
          onKeyDown={handleKeyDown}
          onPointerDown={(event) => {
            draggedRef.current = false
            selectBlockFromHandle(editor, id, event)
          }}
          ref={(handle) => {
            handleElementRef.current = handle
            handleRef(handle)
          }}
          size="icon"
          tabIndex={initialTabIndex}
          title={i18n.t('plate.blockDrag.instructions')}
          type="button"
          variant="ghost"
        >
          <GripVertical
            aria-hidden="true"
            className={cn(
              'opacity-0 transition-opacity duration-150 motion-reduce:transition-none',
              'group-hover/handle:opacity-100 group-hover/block:opacity-100',
              'group-focus-within/block:opacity-100',
              isDragging && 'opacity-100',
            )}
          />
        </Button>
        <BlockActionMenu {...availability} onAction={handleAction} />
      </DropdownMenu>
      {dropLine === 'top' ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-primary"
          data-block-drop-line="top"
        />
      ) : null}
      {children}
      {dropLine === 'bottom' ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-primary"
          data-block-drop-line="bottom"
        />
      ) : null}
    </div>
  )
}

const BlockDraggableWrapper = (props: PlateElementProps) => <BlockDraggable {...props} />

export const blockDraggableWrapper: RenderNodeWrapper = ({ editor, element }) => {
  const path = editor.api.findPath(element)
  if (path?.length !== 1) return
  return BlockDraggableWrapper
}
