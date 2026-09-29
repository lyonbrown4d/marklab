import { useCallback, useEffect, useRef, useState } from 'react'

type UseAppTerminalAreaOptions = {
  disabled: boolean
}

export const useAppTerminalArea = ({ disabled }: UseAppTerminalAreaOptions) => {
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [terminalInitialized, setTerminalInitialized] = useState(false)
  const [terminalFocusRequest, setTerminalFocusRequest] = useState(0)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const focusFrameRef = useRef<number | null>(null)
  const effectiveTerminalOpen = terminalOpen && !disabled

  const cancelFocusRestore = useCallback(() => {
    if (focusFrameRef.current === null) return
    window.cancelAnimationFrame(focusFrameRef.current)
    focusFrameRef.current = null
  }, [])

  useEffect(() => cancelFocusRestore, [cancelFocusRestore])

  const closeTerminalArea = useCallback(() => {
    setTerminalOpen(false)
    cancelFocusRestore()
    const returnTarget = returnFocusRef.current
    returnFocusRef.current = null
    focusFrameRef.current = window.requestAnimationFrame(() => {
      focusFrameRef.current = null
      if (returnTarget?.isConnected) returnTarget.focus()
    })
  }, [cancelFocusRestore])

  const openTerminalArea = useCallback(() => {
    if (disabled) return
    cancelFocusRestore()
    if (!terminalOpen && document.activeElement instanceof HTMLElement) {
      returnFocusRef.current = document.activeElement
    }
    setTerminalInitialized(true)
    setTerminalOpen(true)
    setTerminalFocusRequest((request) => request + 1)
  }, [cancelFocusRestore, disabled, terminalOpen])

  const toggleTerminalArea = useCallback(() => {
    if (terminalOpen) {
      closeTerminalArea()
      return
    }
    openTerminalArea()
  }, [closeTerminalArea, openTerminalArea, terminalOpen])

  return {
    closeTerminalArea,
    effectiveTerminalOpen,
    openTerminalArea,
    terminalInitialized,
    terminalFocusRequest,
    terminalOpen,
    toggleTerminalArea,
  }
}
