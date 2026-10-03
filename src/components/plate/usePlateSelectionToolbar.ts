import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
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
  anchor: { left: number; top: number }
  open: boolean
}

export type PlateSelectionToolbarController = ToolbarState & {
  runAction: (action: PlateSelectionToolbarAction) => boolean
  setToolbarElement: (element: HTMLElement | null) => void
}

const closedState: ToolbarState = {
  activeMarks: { bold: false, code: false, italic: false, link: false, strike: false },
  anchor: { left: 0, top: 0 },
  open: false,
}

const containsSelectionNode = (root: HTMLElement, node: Node | null) =>
  Boolean(node && (node === root || root.contains(node)))

const equalMarks = (left: PlateSelectionToolbarMarks, right: PlateSelectionToolbarMarks) =>
  left.bold === right.bold &&
  left.code === right.code &&
  left.italic === right.italic &&
  left.link === right.link &&
  left.strike === right.strike

const equalState = (left: ToolbarState, right: ToolbarState) =>
  left.open === right.open &&
  left.anchor.left === right.anchor.left &&
  left.anchor.top === right.anchor.top &&
  equalMarks(left.activeMarks, right.activeMarks)

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

  const sync = useCallback(() => {
    const root = editableRef.current
    const selection = window.getSelection()
    const activeElement = document.activeElement
    const focusInside = Boolean(
      root?.contains(activeElement) || toolbarElementRef.current?.contains(activeElement),
    )
    if (
      readOnly ||
      (canEdit && !canEdit()) ||
      composingRef.current ||
      !root ||
      !focusInside ||
      !editor.selection ||
      !editor.api.isExpanded() ||
      !selection?.rangeCount ||
      !containsSelectionNode(root, selection.anchorNode) ||
      !containsSelectionNode(root, selection.focusNode)
    ) {
      setState((current) => (current.open ? closedState : current))
      return
    }
    const range = selection.getRangeAt(0)
    if (typeof range.getBoundingClientRect !== 'function') {
      setState((current) => (current.open ? closedState : current))
      return
    }
    const rect = range.getBoundingClientRect()
    const next: ToolbarState = {
      activeMarks: getPlateSelectionToolbarMarks(editor),
      anchor: { left: rect.left + rect.width / 2, top: rect.top },
      open: rect.width > 0 || rect.height > 0,
    }
    setState((current) => (equalState(current, next) ? current : next))
  }, [canEdit, editableRef, editor, readOnly])

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
    document.addEventListener('scroll', scheduleSync, true)
    window.addEventListener('resize', scheduleSync)
    root.addEventListener('compositionstart', handleCompositionStart)
    root.addEventListener('compositionend', handleCompositionEnd)
    sync()
    return () => {
      document.removeEventListener('selectionchange', scheduleSync)
      document.removeEventListener('focusin', scheduleSync)
      document.removeEventListener('scroll', scheduleSync, true)
      window.removeEventListener('resize', scheduleSync)
      root.removeEventListener('compositionstart', handleCompositionStart)
      root.removeEventListener('compositionend', handleCompositionEnd)
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
    }
  }, [editableRef, scheduleSync, sync])

  const runAction = useCallback(
    (action: PlateSelectionToolbarAction) => {
      if (canEdit && !canEdit()) return false
      const handled = runPlateSelectionToolbarAction(editor, action, { onLink })
      if (handled) queueMicrotask(sync)
      return handled
    },
    [canEdit, editor, onLink, sync],
  )

  const setToolbarElement = useCallback((element: HTMLElement | null) => {
    toolbarElementRef.current = element
  }, [])

  return { ...state, runAction, setToolbarElement }
}
