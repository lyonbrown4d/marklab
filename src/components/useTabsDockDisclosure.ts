import { useCallback, useEffect, useRef, useState } from 'react'

export const TAB_DOCK_OPEN_DELAY_MS = 140
export const TAB_DOCK_CLOSE_DELAY_MS = 200

export const useTabsDockDisclosure = () => {
  const [pinned, setPinned] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const openTimerRef = useRef<number | null>(null)
  const closeTimerRef = useRef<number | null>(null)

  const clearTimers = useCallback(() => {
    if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current)
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
    openTimerRef.current = null
    closeTimerRef.current = null
  }, [])

  const previewAfterDelay = useCallback(() => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = null
    if (pinned || previewOpen || openTimerRef.current !== null) return
    openTimerRef.current = window.setTimeout(() => {
      openTimerRef.current = null
      setPreviewOpen(true)
    }, TAB_DOCK_OPEN_DELAY_MS)
  }, [pinned, previewOpen])

  const keepPreviewOpen = useCallback(() => {
    clearTimers()
    if (!pinned) setPreviewOpen(true)
  }, [clearTimers, pinned])

  const closePreviewAfterDelay = useCallback(() => {
    if (pinned || closeTimerRef.current !== null) return
    if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current)
    openTimerRef.current = null
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null
      setPreviewOpen(false)
    }, TAB_DOCK_CLOSE_DELAY_MS)
  }, [pinned])

  const pinOpen = useCallback(() => {
    clearTimers()
    setPreviewOpen(false)
    setPinned(true)
  }, [clearTimers])

  const collapse = useCallback(() => {
    clearTimers()
    setPinned(false)
    setPreviewOpen(false)
  }, [clearTimers])

  useEffect(() => () => clearTimers(), [clearTimers])

  return {
    collapse,
    closePreviewAfterDelay,
    expanded: pinned || previewOpen,
    keepPreviewOpen,
    pinOpen,
    pinned,
    previewAfterDelay,
  }
}
