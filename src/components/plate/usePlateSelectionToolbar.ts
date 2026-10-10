import {
  flip,
  getDOMSelectionBoundingClientRect,
  getDefaultBoundingClientRect,
  offset,
  shift,
  useVirtualFloating,
} from '@platejs/floating'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react'
import type { PlateEditor } from 'platejs/react'
import {
  getPlateSelectionToolbarMarks,
  runPlateSelectionToolbarAction,
  type PlateSelectionToolbarAction,
  type PlateSelectionToolbarMarks,
} from '@/components/plate/selection/selectionToolbarActions'

type UsePlateSelectionToolbarOptions = {
  canEdit?: () => boolean
  editableRef: RefObject<HTMLElement | null>
  editor: PlateEditor
  onLink?: (editor: PlateEditor) => void
  readOnly: boolean
}

type ToolbarState = {
  activeMarks: PlateSelectionToolbarMarks
  open: boolean
}

export type PlateSelectionToolbarController = ToolbarState & {
  anchor: { left: number; top: number }
  floatingStyle?: CSSProperties
  runAction: (action: PlateSelectionToolbarAction) => boolean
  setToolbarElement: (element: HTMLElement | null) => void
}

const closedState: ToolbarState = {
  activeMarks: { bold: false, code: false, italic: false, link: false, strike: false },
  open: false,
}

const floatingMiddleware = [offset(8), flip({ padding: 8 }), shift({ padding: 8 })]

const containsSelectionNode = (root: HTMLElement, node: Node | null) =>
  Boolean(node && (node === root || root.contains(node)))

const equalMarks = (left: PlateSelectionToolbarMarks, right: PlateSelectionToolbarMarks) =>
  left.bold === right.bold &&
  left.code === right.code &&
  left.italic === right.italic &&
  left.link === right.link &&
  left.strike === right.strike

const equalState = (left: ToolbarState, right: ToolbarState) =>
  left.open === right.open && equalMarks(left.activeMarks, right.activeMarks)

export const usePlateSelectionToolbar = ({
  canEdit,
  editableRef,
  editor,
  onLink,
  readOnly,
}: UsePlateSelectionToolbarOptions): PlateSelectionToolbarController => {
  const [state, setState] = useState<ToolbarState>(closedState)
  const toolbarElementRef = useRef<HTMLElement | null>(null)
  const composingRef = useRef(false)
  const frameRef = useRef<number | null>(null)
  const updateFrameRef = useRef<number | null>(null)
  const lastSelectionRectRef = useRef<ReturnType<typeof getDOMSelectionBoundingClientRect> | null>(
    null,
  )
  const getSelectionRect = useCallback(() => {
    const root = editableRef.current
    const selection = window.getSelection()
    if (
      root &&
      selection?.rangeCount &&
      containsSelectionNode(root, selection.anchorNode) &&
      containsSelectionNode(root, selection.focusNode)
    ) {
      const rect = getDOMSelectionBoundingClientRect()
      lastSelectionRectRef.current = rect
      return rect
    }
    return lastSelectionRectRef.current ?? getDefaultBoundingClientRect()
  }, [editableRef])
  const {
    refs,
    style: floatingStyle,
    update,
    virtualElementRef,
    x,
    y,
  } = useVirtualFloating({
    getBoundingClientRect: getSelectionRect,
    middleware: floatingMiddleware,
    open: state.open,
    placement: 'top',
    strategy: 'fixed',
  })
  const { setFloating } = refs

  useLayoutEffect(() => {
    const virtualElement = virtualElementRef.current
    virtualElement.contextElement = editableRef.current ?? undefined
    return () => {
      virtualElement.contextElement = undefined
    }
  }, [editableRef, virtualElementRef])

  const sync = useCallback(() => {
    const root = editableRef.current
    const selection = window.getSelection()
    const activeElement = document.activeElement
    const toolbarFocused = Boolean(toolbarElementRef.current?.contains(activeElement))
    const focusInside = Boolean(root?.contains(activeElement) || toolbarFocused)
    const selectionInside = Boolean(
      root &&
      selection?.rangeCount &&
      containsSelectionNode(root, selection.anchorNode) &&
      containsSelectionNode(root, selection.focusNode),
    )
    if (
      readOnly ||
      (canEdit && !canEdit()) ||
      composingRef.current ||
      !root ||
      !focusInside ||
      !editor.selection ||
      !editor.api.isExpanded() ||
      (!toolbarFocused && !selectionInside)
    ) {
      setState((current) => (current.open ? closedState : current))
      return
    }
    const rect = getSelectionRect()
    const next: ToolbarState = {
      activeMarks: getPlateSelectionToolbarMarks(editor),
      open: rect.width > 0 || rect.height > 0,
    }
    setState((current) => (equalState(current, next) ? current : next))
    if (next.open) void update()
  }, [canEdit, editableRef, editor, getSelectionRect, readOnly, update])

  const scheduleSync = useCallback(() => {
    if (frameRef.current !== null) return
    if (typeof window.requestAnimationFrame !== 'function') {
      sync()
      return
    }
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null
      sync()
    })
  }, [sync])

  const scheduleFloatingUpdate = useCallback(() => {
    if (updateFrameRef.current !== null) return
    if (typeof window.requestAnimationFrame !== 'function') {
      void update()
      return
    }
    updateFrameRef.current = window.requestAnimationFrame(() => {
      updateFrameRef.current = null
      void update()
    })
  }, [update])

  useEffect(() => {
    const root = editableRef.current
    if (!root) return
    const handleCompositionStart = () => {
      composingRef.current = true
      setState((current) => (current.open ? closedState : current))
    }
    const handleCompositionEnd = () => {
      composingRef.current = false
      sync()
    }
    document.addEventListener('selectionchange', scheduleSync)
    document.addEventListener('focusin', scheduleSync)
    root.addEventListener('compositionstart', handleCompositionStart)
    root.addEventListener('compositionend', handleCompositionEnd)
    sync()
    return () => {
      document.removeEventListener('selectionchange', scheduleSync)
      document.removeEventListener('focusin', scheduleSync)
      root.removeEventListener('compositionstart', handleCompositionStart)
      root.removeEventListener('compositionend', handleCompositionEnd)
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
    }
  }, [editableRef, scheduleSync, sync])

  useEffect(() => {
    if (!state.open) return
    const root = editableRef.current
    if (!root) return
    const visualViewport = window.visualViewport
    root.addEventListener('scroll', scheduleFloatingUpdate, { passive: true })
    visualViewport?.addEventListener('resize', scheduleFloatingUpdate)
    return () => {
      root.removeEventListener('scroll', scheduleFloatingUpdate)
      visualViewport?.removeEventListener('resize', scheduleFloatingUpdate)
      if (updateFrameRef.current !== null) {
        window.cancelAnimationFrame(updateFrameRef.current)
        updateFrameRef.current = null
      }
    }
  }, [editableRef, scheduleFloatingUpdate, state.open])

  const runAction = useCallback(
    (action: PlateSelectionToolbarAction) => {
      if (canEdit && !canEdit()) return false
      const handled = runPlateSelectionToolbarAction(editor, action, { onLink })
      if (handled) queueMicrotask(sync)
      return handled
    },
    [canEdit, editor, onLink, sync],
  )

  const setToolbarElement = useCallback(
    (element: HTMLElement | null) => {
      toolbarElementRef.current = element
      setFloating(element)
    },
    [setFloating],
  )

  return {
    ...state,
    anchor: { left: x ?? 0, top: y ?? 0 },
    floatingStyle,
    runAction,
    setToolbarElement,
  }
}
