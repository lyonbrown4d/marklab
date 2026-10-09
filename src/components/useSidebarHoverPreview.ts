import { useCallback, useEffect, useRef, useState } from 'react'

export const SIDEBAR_HOVER_OPEN_DELAY_MS = 180
export const SIDEBAR_HOVER_CLOSE_DELAY_MS = 220

type UseSidebarHoverPreviewArgs = {
  pinnedOpen: boolean
  onPinOpen: () => void
  dismissRequest?: number
}

export const useSidebarHoverPreview = ({
  pinnedOpen,
  onPinOpen,
  dismissRequest = 0,
}: UseSidebarHoverPreviewArgs) => {
  const [previewOpen, setPreviewOpen] = useState(false)
  const handledDismissRequestRef = useRef(dismissRequest)
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
    if (pinnedOpen || previewOpenRef.current || openTimerRef.current !== null) return
    openTimerRef.current = window.setTimeout(() => {
      openTimerRef.current = null
      previewOpenRef.current = true
      setPreviewOpen(true)
    }, SIDEBAR_HOVER_OPEN_DELAY_MS)
  }, [clearCloseTimer, pinnedOpen])

  const leaveHoverRegion = useCallback(() => {
    clearOpenTimer()
    if (!previewOpenRef.current || closeTimerRef.current !== null) return
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null
      if (!previewOpenRef.current) return
      previewOpenRef.current = false
      setPreviewOpen(false)
    }, SIDEBAR_HOVER_CLOSE_DELAY_MS)
  }, [clearOpenTimer])

  const enterDrawer = useCallback(() => {
    clearCloseTimer()
  }, [clearCloseTimer])

  const pinOpen = useCallback(() => {
    clearCloseTimer()
    if (!previewOpenRef.current) return
    previewOpenRef.current = false
    onPinOpen()
    setPreviewOpen(false)
  }, [clearCloseTimer, onPinOpen])

  const dismissPreview = useCallback(() => {
    clearOpenTimer()
    clearCloseTimer()
    if (!previewOpenRef.current) return
    previewOpenRef.current = false
    setPreviewOpen(false)
  }, [clearCloseTimer, clearOpenTimer])

  useEffect(() => {
    if (!pinnedOpen) return
    dismissPreview()
  }, [dismissPreview, pinnedOpen])

  useEffect(() => {
    if (handledDismissRequestRef.current === dismissRequest) return
    handledDismissRequestRef.current = dismissRequest
    dismissPreview()
  }, [dismissPreview, dismissRequest])

  useEffect(
    () => () => {
      clearOpenTimer()
      clearCloseTimer()
    },
    [clearCloseTimer, clearOpenTimer],
  )

  return { dismissPreview, enterDrawer, enterHoverZone, leaveHoverRegion, pinOpen, previewOpen }
}
