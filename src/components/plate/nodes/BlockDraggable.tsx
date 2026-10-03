import { DRAG_ITEM_BLOCK, useDragNode, useDropLine, useDropNode } from '@platejs/dnd'
import { GripVertical } from 'lucide-react'
import type { TElement } from 'platejs'
import {
  useEditorRef,
  type PlateEditor,
  type PlateElementProps,
  type RenderNodeWrapper,
} from 'platejs/react'
import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react'
import { NativeTypes } from 'react-dnd-html5-backend'
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

type BlockDragHandleProps = {
  editor: PlateEditor
  element: TElement
  nodeRef: RefObject<HTMLDivElement | null>
  onDraggingChange: (dragging: boolean) => void
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
}

const BlockDragHandle = ({
  editor,
  element,
  nodeRef,
  onDraggingChange,
  onKeyDown,
}: BlockDragHandleProps) => {
  const [{ isDragging }, handleRef, previewRef] = useDragNode(editor, {
    element,
    type: DRAG_ITEM_BLOCK,
  })

  useEffect(() => {
    previewRef(nodeRef)
  }, [nodeRef, previewRef])

  useEffect(() => {
    onDraggingChange(isDragging)
  }, [isDragging, onDraggingChange])

  return (
    <Button
      aria-keyshortcuts="ArrowUp ArrowDown"
      aria-label="Move block"
      className={cn(
        'absolute -left-9 top-1 z-10 size-7 cursor-grab p-0 text-muted-foreground shadow-none',
        'active:cursor-grabbing motion-reduce:transition-none',
      )}
      contentEditable={false}
      data-block-id={element.id as string}
      data-block-drag-handle="true"
      onKeyDown={onKeyDown}
      ref={(button) => {
        handleRef(button)
      }}
      size="icon"
      title="Drag to move block. Use the arrow keys to move it up or down."
      type="button"
      variant="ghost"
    >
      <GripVertical aria-hidden="true" />
    </Button>
  )
}

export const BlockDraggable = ({ children, element }: PlateElementProps) => {
  const editor = useEditorRef()
  const [handleActive, setHandleActive] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const multiplePreviewRef = useRef<HTMLDivElement | null>(null)
  const nodeRef = useRef<HTMLDivElement | null>(null)
  const { dropLine } = useDropLine({ id: element.id as string, orientation: 'vertical' })
  const [, dropRef] = useDropNode(editor, {
    accept: [DRAG_ITEM_BLOCK, NativeTypes.FILE],
    element,
    multiplePreviewRef,
    nodeRef,
    orientation: 'vertical',
  })

  useEffect(() => {
    dropRef(nodeRef)
  }, [dropRef])

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    event.stopPropagation()
    if (moveTopLevelBlock(editor, element, event.key === 'ArrowUp' ? 'up' : 'down')) {
      restoreHandleFocus(editor, element)
    }
  }

  const handleBlurCapture = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setHandleActive(false)
  }

  const handlePointerLeave = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(document.activeElement)) setHandleActive(false)
  }

  const handleVisible = handleActive || isDragging

  return (
    <div
      className={cn('plate-block-draggable group/block relative', isDragging && 'opacity-50')}
      data-block-drag-wrapper="true"
      data-block-id={element.id as string}
      onBlurCapture={handleBlurCapture}
      onFocusCapture={() => setHandleActive(true)}
      onPointerEnter={() => setHandleActive(true)}
      onPointerLeave={handlePointerLeave}
      ref={nodeRef}
    >
      {handleVisible ? (
        <BlockDragHandle
          editor={editor}
          element={element}
          nodeRef={nodeRef}
          onDraggingChange={setIsDragging}
          onKeyDown={handleKeyDown}
        />
      ) : null}
      {dropLine === 'top' ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-primary"
        />
      ) : null}
      {children}
      {dropLine === 'bottom' ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-primary"
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
