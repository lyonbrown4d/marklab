import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { clearDocumentNavigation, setDocumentScrollProgress } from '@/utils/editorNavigation'

const CONTENT_MEASURE_DELAY_MS = 240
const noop = () => undefined

const readProgress = (element: HTMLElement) => {
  const scrollable = Math.max(0, element.scrollHeight - element.clientHeight)
  if (scrollable === 0) return 100
  return Math.max(0, Math.min(100, Math.round((element.scrollTop / scrollable) * 100)))
}

export const usePlateDocumentNavigation = (
  activePath: string | null,
  editableRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
) => {
  const scheduleContentMeasureRef = useRef<() => void>(noop)
  const scheduleContentMeasure = useCallback(() => scheduleContentMeasureRef.current(), [])

  useEffect(() => {
    const editable = editableRef.current
    if (!activePath || !enabled || !editable) {
      scheduleContentMeasureRef.current = noop
      if (activePath) clearDocumentNavigation(activePath)
      return
    }
    let frame: number | null = null
    let contentMeasureTimer: number | null = null
    const publish = () => {
      frame = null
      setDocumentScrollProgress(activePath, readProgress(editable))
    }
    const schedule = () => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(publish)
    }
    const scheduleContentMeasureAfterIdle = () => {
      if (contentMeasureTimer !== null) window.clearTimeout(contentMeasureTimer)
      contentMeasureTimer = window.setTimeout(() => {
        contentMeasureTimer = null
        schedule()
      }, CONTENT_MEASURE_DELAY_MS)
    }
    scheduleContentMeasureRef.current = scheduleContentMeasureAfterIdle
    schedule()
    editable.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule, { passive: true })
    const resizeObserver = new ResizeObserver(schedule)
    resizeObserver.observe(editable)
    return () => {
      scheduleContentMeasureRef.current = noop
      editable.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      resizeObserver.disconnect()
      if (contentMeasureTimer !== null) window.clearTimeout(contentMeasureTimer)
      if (frame !== null) window.cancelAnimationFrame(frame)
      clearDocumentNavigation(activePath)
    }
  }, [activePath, editableRef, enabled])

  return scheduleContentMeasure
}
