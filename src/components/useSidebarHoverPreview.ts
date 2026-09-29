import { useCallback, useEffect, useRef } from 'react'

export const SIDEBAR_HOVER_OPEN_DELAY_MS = 180
export const SIDEBAR_HOVER_CLOSE_DELAY_MS = 220

type UseSidebarHoverPreviewArgs = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const useSidebarHoverPreview = ({ open, onOpenChange }: UseSidebarHoverPreviewArgs) => {
  const previewOpenRef = useRef(false)
  const openTimerRef = useRef<number | null>(null)
  const closeTimerRef = useRef<number | null>(null)

  const clearOpenTimer = useCallback(() => {
    if (openTimerRef.current === null) return
    window.clearTimeout(openTimerRef.current)
    openTimerRef.current = null
  }, [])

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current === null) return
    window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = null
  }, [])

  const enterHoverZone = useCallback(() => {
    clearCloseTimer()
    if (open || openTimerRef.current !== null) return
    openTimerRef.current = window.setTimeout(() => {
      openTimerRef.current = null
      previewOpenRef.current = true
      onOpenChange(true)
    }, SIDEBAR_HOVER_OPEN_DELAY_MS)
  }, [clearCloseTimer, onOpenChange, open])

  const leaveHoverRegion = useCallback(() => {
    clearOpenTimer()
    if (!previewOpenRef.current || closeTimerRef.current !== null) return
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null
      if (!previewOpenRef.current) return
      previewOpenRef.current = false
      onOpenChange(false)
    }, SIDEBAR_HOVER_CLOSE_DELAY_MS)
  }, [clearOpenTimer, onOpenChange])

  const enterDrawer = useCallback(() => {
    clearCloseTimer()
  }, [clearCloseTimer])

  const pinOpen = useCallback(() => {
    clearCloseTimer()
    previewOpenRef.current = false
  }, [clearCloseTimer])

  useEffect(() => {
    if (open) {
      clearOpenTimer()
      return
    }
    previewOpenRef.current = false
    clearCloseTimer()
  }, [clearCloseTimer, clearOpenTimer, open])

  useEffect(
    () => () => {
      clearOpenTimer()
      clearCloseTimer()
    },
    [clearCloseTimer, clearOpenTimer],
  )

  return { enterDrawer, enterHoverZone, leaveHoverRegion, pinOpen }
}
