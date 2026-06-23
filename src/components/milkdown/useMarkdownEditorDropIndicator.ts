import { useEffect, useRef, type RefObject } from 'react'
import {
  DEFAULT_DROP_INDICATOR_GUTTER_OFFSET_PX,
  getDropIndicatorLayout,
  hasVisibleRect,
  parseCssPixelValue,
  shouldAllowEdgeAutoScroll,
  type MarkdownDropIndicatorLayout,
} from '@/components/milkdown/markdownDropIndicatorGeometry'

const MARKDOWN_BLOCK_SELECTOR = '.marklab-md-block'
const EDITOR_SCROLL_VIEWPORT_SELECTOR = '.editor-scroll-viewport'
const MILKDOWN_BLOCK_HANDLE_SELECTOR = '.milkdown-block-handle'

type UseMarkdownEditorDropIndicatorOptions = {
  editorRootRef: RefObject<HTMLDivElement | null>
  shellRef: RefObject<HTMLDivElement | null>
}

export const useMarkdownEditorDropIndicator = ({
  editorRootRef,
  shellRef,
}: UseMarkdownEditorDropIndicatorOptions) => {
  const indicatorRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const shell = shellRef.current
    const editorRoot = editorRootRef.current
    if (!shell || !editorRoot) return undefined

    let animationFrame = 0
    let dragSessionStarted = false
    let lastDragEvent: DragEvent | null = null
    const scrollLock = {
      active: false,
      left: 0,
      top: 0,
      viewport: null as HTMLElement | null,
    }

    const hideIndicator = () => {
      lastDragEvent = null
      dragSessionStarted = false
      scrollLock.active = false
      scrollLock.viewport = null
      shell.removeAttribute('data-editor-dragging')
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame)
        animationFrame = 0
      }
      writeIndicatorVisibility(indicatorRef.current, false)
    }

    const updateIndicator = () => {
      animationFrame = 0

      const dragEvent = lastDragEvent
      const indicator = indicatorRef.current
      const currentEditorRoot = editorRootRef.current
      const currentShell = shellRef.current
      if (!dragEvent || !indicator || !currentEditorRoot || !currentShell) {
        hideIndicator()
        return
      }

      restoreLockedScroll(scrollLock, dragEvent)

      const block = findDropTargetBlock(dragEvent, currentEditorRoot)
      if (!block) {
        hideIndicator()
        return
      }

      const blockRect = block.getBoundingClientRect()
      const clampRect = currentShell.getBoundingClientRect()
      if (!hasVisibleRect(blockRect) || !hasVisibleRect(clampRect)) {
        hideIndicator()
        return
      }

      const gutterOffsetPx = parseCssPixelValue(
        window
          .getComputedStyle(currentEditorRoot)
          .getPropertyValue('--editor-block-drop-indicator-gutter-offset'),
        DEFAULT_DROP_INDICATOR_GUTTER_OFFSET_PX,
      )
      const layout = getDropIndicatorLayout({
        blockRect,
        clientY: dragEvent.clientY,
        clampRect,
        gutterOffsetPx,
      })

      writeIndicatorLayout(indicator, layout)
      restoreLockedScroll(scrollLock, dragEvent)
    }

    const scheduleUpdate = (event: DragEvent) => {
      if (isFileDrag(event)) {
        hideIndicator()
        return
      }

      shell.dataset.editorDragging = 'true'
      dragSessionStarted = true
      lockCurrentScroll(scrollLock, shell)
      lastDragEvent = event
      if (animationFrame) return
      animationFrame = window.requestAnimationFrame(updateIndicator)
    }

    const handleDragStart = (event: DragEvent) => {
      if (isFileDrag(event)) return
      shell.dataset.editorDragging = 'true'
      dragSessionStarted = true
      lockCurrentScroll(scrollLock, shell)
    }

    const handleBlockHandlePointerDown = (event: Event) => {
      if (!isMilkdownBlockHandleEvent(event)) return

      dragSessionStarted = false
      shell.dataset.editorDragging = 'true'
      lockCurrentScroll(scrollLock, shell)
      restoreLockedScrollAroundSelectionFocus(scrollLock)
    }

    const handleBlockHandlePointerUp = () => {
      if (dragSessionStarted) return
      window.requestAnimationFrame(() => {
        if (!dragSessionStarted) hideIndicator()
      })
    }

    shell.addEventListener('pointerdown', handleBlockHandlePointerDown, true)
    shell.addEventListener('mousedown', handleBlockHandlePointerDown, true)
    shell.addEventListener('pointerup', handleBlockHandlePointerUp, true)
    shell.addEventListener('mouseup', handleBlockHandlePointerUp, true)
    shell.addEventListener('dragstart', handleDragStart, true)
    shell.addEventListener('dragenter', scheduleUpdate, true)
    shell.addEventListener('dragover', scheduleUpdate, true)
    shell.addEventListener('drop', hideIndicator, true)
    shell.addEventListener('dragend', hideIndicator, true)
    document.addEventListener('dragend', hideIndicator, true)
    window.addEventListener('blur', hideIndicator)

    return () => {
      shell.removeEventListener('pointerdown', handleBlockHandlePointerDown, true)
      shell.removeEventListener('mousedown', handleBlockHandlePointerDown, true)
      shell.removeEventListener('pointerup', handleBlockHandlePointerUp, true)
      shell.removeEventListener('mouseup', handleBlockHandlePointerUp, true)
      shell.removeEventListener('dragstart', handleDragStart, true)
      shell.removeEventListener('dragenter', scheduleUpdate, true)
      shell.removeEventListener('dragover', scheduleUpdate, true)
      shell.removeEventListener('drop', hideIndicator, true)
      shell.removeEventListener('dragend', hideIndicator, true)
      document.removeEventListener('dragend', hideIndicator, true)
      window.removeEventListener('blur', hideIndicator)
      hideIndicator()
    }
  }, [editorRootRef, shellRef])

  return indicatorRef
}

const findDropTargetBlock = (event: DragEvent, editorRoot: HTMLElement) => {
  const directBlock = findClosestBlock(event.target, editorRoot)
  if (directBlock) return directBlock

  const pointElement = document.elementFromPoint(event.clientX, event.clientY)
  const pointBlock = findClosestBlock(pointElement, editorRoot)
  if (pointBlock) return pointBlock

  return findNearestBlockByY(editorRoot, event.clientY)
}

const findClosestBlock = (target: EventTarget | null, editorRoot: HTMLElement) => {
  if (!(target instanceof Element) || !editorRoot.contains(target)) return null
  return target.closest<HTMLElement>(MARKDOWN_BLOCK_SELECTOR)
}

const findNearestBlockByY = (editorRoot: HTMLElement, clientY: number) => {
  let nearestBlock: HTMLElement | null = null
  let nearestDistance = Number.POSITIVE_INFINITY

  editorRoot.querySelectorAll<HTMLElement>(MARKDOWN_BLOCK_SELECTOR).forEach((block) => {
    const rect = block.getBoundingClientRect()
    if (!hasVisibleRect(rect)) return

    const distance =
      clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0
    if (distance >= nearestDistance) return

    nearestBlock = block
    nearestDistance = distance
  })

  return nearestBlock
}

const isFileDrag = (event: DragEvent) => {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

const isMilkdownBlockHandleEvent = (event: Event) => {
  const target = event.target
  return target instanceof Element && Boolean(target.closest(MILKDOWN_BLOCK_HANDLE_SELECTOR))
}

const lockCurrentScroll = (
  scrollLock: {
    active: boolean
    left: number
    top: number
    viewport: HTMLElement | null
  },
  shell: HTMLElement,
) => {
  if (scrollLock.active) return

  const viewport = shell.querySelector<HTMLElement>(EDITOR_SCROLL_VIEWPORT_SELECTOR)
  if (!viewport) return

  scrollLock.active = true
  scrollLock.left = viewport.scrollLeft
  scrollLock.top = viewport.scrollTop
  scrollLock.viewport = viewport
}

const restoreLockedScroll = (
  scrollLock: {
    active: boolean
    left: number
    top: number
    viewport: HTMLElement | null
  },
  event: DragEvent,
) => {
  const viewport = scrollLock.viewport
  if (!scrollLock.active || !viewport || shouldAllowEdgeAutoScroll(event, viewport)) return

  if (viewport.scrollLeft !== scrollLock.left) {
    viewport.scrollLeft = scrollLock.left
  }
  if (viewport.scrollTop !== scrollLock.top) {
    viewport.scrollTop = scrollLock.top
  }
}

const restoreLockedScrollWithoutEdgeAllowance = (scrollLock: {
  active: boolean
  left: number
  top: number
  viewport: HTMLElement | null
}) => {
  const viewport = scrollLock.viewport
  if (!scrollLock.active || !viewport) return

  if (viewport.scrollLeft !== scrollLock.left) {
    viewport.scrollLeft = scrollLock.left
  }
  if (viewport.scrollTop !== scrollLock.top) {
    viewport.scrollTop = scrollLock.top
  }
}

const restoreLockedScrollAroundSelectionFocus = (scrollLock: {
  active: boolean
  left: number
  top: number
  viewport: HTMLElement | null
}) => {
  restoreLockedScrollWithoutEdgeAllowance(scrollLock)
  queueMicrotask(() => {
    restoreLockedScrollWithoutEdgeAllowance(scrollLock)
  })
  window.requestAnimationFrame(() => {
    restoreLockedScrollWithoutEdgeAllowance(scrollLock)
  })
  window.setTimeout(() => {
    restoreLockedScrollWithoutEdgeAllowance(scrollLock)
  }, 0)
}

const writeIndicatorLayout = (
  indicator: HTMLDivElement,
  { position, width, x, y }: MarkdownDropIndicatorLayout,
) => {
  indicator.style.setProperty('--editor-drop-indicator-x', `${x}px`)
  indicator.style.setProperty('--editor-drop-indicator-y', `${y}px`)
  indicator.style.setProperty('--editor-drop-indicator-width', `${width}px`)
  indicator.dataset.position = position
  writeIndicatorVisibility(indicator, true)
}

const writeIndicatorVisibility = (indicator: HTMLDivElement | null, visible: boolean) => {
  if (!indicator) return
  indicator.dataset.visible = visible ? 'true' : 'false'
}
