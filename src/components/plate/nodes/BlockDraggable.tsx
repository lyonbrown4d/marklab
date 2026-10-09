import { useDraggable, useDropLine } from '@platejs/dnd'
import { GripVertical } from 'lucide-react'
import type { TElement } from 'platejs'
import {
  useEditorRef,
  type PlateEditor,
  type PlateElementProps,
  type RenderNodeWrapper,
} from 'platejs/react'
import type { KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type MoveDirection = 'down' | 'up'

const moveTopLevelBlock = (editor: PlateEditor, element: TElement, direction: MoveDirection) => {
  const path = editor.api.findPath(element)
  if (!path || path.length !== 1) return false

  const index = path[0]
  if (direction === 'up') {
    if (index === 0) return false
    editor.tf.moveNodes({ at: path, to: [index - 1] })
    return true
  }

  if (index >= editor.children.length - 1) return false
  editor.tf.moveNodes({ at: path, to: [index + 1] })
  return true
}

const restoreHandleFocus = (editor: PlateEditor, element: TElement) => {
  queueMicrotask(() => {
    const block = editor.api.toDOMNode(element)
    block?.parentElement
      ?.querySelector<HTMLButtonElement>('[data-block-drag-handle="true"]')
      ?.focus()
  })
}

export const BlockDraggable = ({ children, element }: PlateElementProps) => {
  const editor = useEditorRef()
  const { dropLine } = useDropLine({ id: element.id as string, orientation: 'vertical' })
  const { handleRef, isDragging, nodeRef } = useDraggable({
    element,
    orientation: 'vertical',
  })

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    event.stopPropagation()
    if (moveTopLevelBlock(editor, element, event.key === 'ArrowUp' ? 'up' : 'down')) {
      restoreHandleFocus(editor, element)
    }
  }

  return (
    <div
      className={cn('plate-block-draggable group/block relative pl-8', isDragging && 'opacity-50')}
      data-block-drag-wrapper="true"
      data-block-id={element.id as string}
      ref={nodeRef}
    >
      <Button
        aria-keyshortcuts="ArrowUp ArrowDown"
        aria-label="Move block"
        className={cn(
          'group/handle pointer-events-auto absolute left-0 top-1 z-10 size-7 cursor-grab p-0 text-muted-foreground shadow-none',
          'active:cursor-grabbing',
        )}
        contentEditable={false}
        data-block-id={element.id as string}
        data-block-drag-handle="true"
        onKeyDown={handleKeyDown}
        ref={handleRef}
        size="icon"
        title="Drag to move block. Use the arrow keys to move it up or down."
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
