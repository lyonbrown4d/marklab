import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { selectElementText } from '@/pages/graphKeyboardActions'

export const useGraphTitleFocus = (graphShellRef: RefObject<HTMLDivElement | null>) => {
  const editFrameRef = useRef<number | null>(null)
  const cancelFocusRef = useRef<(() => void) | null>(null)

  const cancelPendingFocus = useCallback(() => {
    cancelFocusRef.current?.()
    cancelFocusRef.current = null
  }, [])

  useEffect(() => {
    return cancelPendingFocus
  }, [cancelPendingFocus])

  const focusHeadingTitle = useCallback(
    (headingId: string | null) => {
      if (!headingId) return false
      const nodeElement = Array.from(
        graphShellRef.current?.querySelectorAll<HTMLElement>('[data-graph-node-id]') ?? [],
      ).find((element) => element.dataset.graphNodeId === headingId)
      const titleElement = nodeElement?.querySelector<HTMLElement>(
        '[data-markdown-block-role="title"]',
      )
      if (!titleElement) return false
      titleElement.focus()
      if (document.activeElement !== titleElement) return false
      cancelPendingFocus()
      selectElementText(titleElement)
      return true
    },
    [cancelPendingFocus, graphShellRef],
  )

  const focusHeadingTitleSoon = useCallback(
    (headingId: string | null) => {
      cancelPendingFocus()
      const shell = graphShellRef.current
      if (!headingId || !shell) return
      const deadline = performance.now() + 1000

      cancelFocusRef.current = () => {
        if (editFrameRef.current !== null) window.cancelAnimationFrame(editFrameRef.current)
        editFrameRef.current = null
        document.removeEventListener('keydown', cancelPendingFocus, true)
        document.removeEventListener('pointerdown', cancelPendingFocus, true)
        document.removeEventListener('focusin', cancelPendingFocus, true)
      }
      document.addEventListener('keydown', cancelPendingFocus, true)
      document.addEventListener('pointerdown', cancelPendingFocus, true)
      document.addEventListener('focusin', cancelPendingFocus, true)

      const tryFocus = () => {
        editFrameRef.current = null
        if (
          !shell.isConnected ||
          graphShellRef.current !== shell ||
          performance.now() >= deadline
        ) {
          cancelPendingFocus()
          return
        }
        if (focusHeadingTitle(headingId)) return
        editFrameRef.current = window.requestAnimationFrame(tryFocus)
      }
      editFrameRef.current = window.requestAnimationFrame(tryFocus)
    },
    [cancelPendingFocus, focusHeadingTitle, graphShellRef],
  )

  return { focusHeadingTitle, focusHeadingTitleSoon }
}
