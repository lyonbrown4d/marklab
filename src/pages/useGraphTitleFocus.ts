import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { selectElementText } from '@/pages/graphKeyboardActions'

export const useGraphTitleFocus = (graphShellRef: RefObject<HTMLDivElement | null>) => {
  const editFrameRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (editFrameRef.current !== null) {
        window.cancelAnimationFrame(editFrameRef.current)
      }
    }
  }, [])

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
      selectElementText(titleElement)
      return true
    },
    [graphShellRef],
  )

  const focusHeadingTitleSoon = useCallback(
    (headingId: string | null) => {
      if (!headingId) return
      if (editFrameRef.current !== null) {
        window.cancelAnimationFrame(editFrameRef.current)
      }
      editFrameRef.current = window.requestAnimationFrame(() => {
        editFrameRef.current = window.requestAnimationFrame(() => {
          editFrameRef.current = null
          focusHeadingTitle(headingId)
        })
      })
    },
    [focusHeadingTitle],
  )

  return { focusHeadingTitle, focusHeadingTitleSoon }
}
