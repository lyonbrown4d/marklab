import { useCallback, useEffect, useRef, type RefObject } from 'react'

const TARGET_VIEWPORT_RATIO = 0.44
const DEAD_ZONE_PX = 18

type TypewriterScrollMetrics = {
  caretTop: number
  clientHeight: number
  currentScrollTop: number
  maxScrollTop: number
  viewportTop: number
}

export const computeTypewriterScrollTop = ({
  caretTop,
  clientHeight,
  currentScrollTop,
  maxScrollTop,
  viewportTop,
}: TypewriterScrollMetrics) => {
  const targetTop = viewportTop + clientHeight * TARGET_VIEWPORT_RATIO
  const delta = caretTop - targetTop
  if (Math.abs(delta) < DEAD_ZONE_PX) return currentScrollTop
  return Math.min(Math.max(currentScrollTop + delta, 0), maxScrollTop)
}

const reduceMotion = () =>
  typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const usePlateTypewriterScroll = ({
  editableRef,
  enabled,
  smooth,
}: {
  editableRef: RefObject<HTMLElement | null>
  enabled: boolean
  smooth: boolean
}) => {
  const frameRef = useRef<number | null>(null)
  const composingRef = useRef(false)

  const cancel = useCallback(() => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
    frameRef.current = null
  }, [])

  const schedule = useCallback(() => {
    if (!enabled || composingRef.current || frameRef.current !== null) return
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null
      const editable = editableRef.current
      const selection = window.getSelection()
      if (!editable || !selection?.isCollapsed || !selection.rangeCount) return
      if (!editable.contains(selection.anchorNode)) return

      const range = selection.getRangeAt(0)
      const caretRect = range.getBoundingClientRect()
      const viewportRect = editable.getBoundingClientRect()
      const nextTop = computeTypewriterScrollTop({
        caretTop: caretRect.top,
        clientHeight: editable.clientHeight,
        currentScrollTop: editable.scrollTop,
        maxScrollTop: Math.max(0, editable.scrollHeight - editable.clientHeight),
        viewportTop: viewportRect.top,
      })
      if (nextTop === editable.scrollTop) return
      editable.scrollTo({
        behavior: smooth && !reduceMotion() ? 'smooth' : 'auto',
        top: nextTop,
      })
    })
  }, [editableRef, enabled, smooth])

  useEffect(() => {
    const editable = editableRef.current
    if (!editable || !enabled) return
    const onCompositionStart = () => {
      composingRef.current = true
      cancel()
    }
    const onCompositionEnd = () => {
      composingRef.current = false
      schedule()
    }
    editable.addEventListener('compositionstart', onCompositionStart)
    editable.addEventListener('compositionend', onCompositionEnd)
    editable.addEventListener('keyup', schedule)
    editable.addEventListener('pointerup', schedule)
    return () => {
      editable.removeEventListener('compositionstart', onCompositionStart)
      editable.removeEventListener('compositionend', onCompositionEnd)
      editable.removeEventListener('keyup', schedule)
      editable.removeEventListener('pointerup', schedule)
      cancel()
    }
  }, [cancel, editableRef, enabled, schedule])

  return schedule
}
