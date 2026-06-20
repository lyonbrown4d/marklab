import { useCallback, useMemo, useState } from 'react'
import { createToggleGuard, PANEL_TOGGLE_GUARD_MS } from '@/utils/toggleGuard'

type UseAppTerminalAreaOptions = {
  disabled: boolean
}

export const useAppTerminalArea = ({ disabled }: UseAppTerminalAreaOptions) => {
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [terminalInitialized, setTerminalInitialized] = useState(false)
  const terminalPanelToggleGuard = useMemo(() => createToggleGuard(PANEL_TOGGLE_GUARD_MS), [])
  const effectiveTerminalOpen = terminalOpen && !disabled

  const closeTerminalArea = useCallback(() => {
    if (!terminalPanelToggleGuard()) return
    setTerminalOpen(false)
  }, [terminalPanelToggleGuard])

  const toggleTerminalArea = useCallback(() => {
    if (!terminalPanelToggleGuard()) return
    setTerminalOpen((open) => {
      if (!open) setTerminalInitialized(true)
      return !open
    })
  }, [terminalPanelToggleGuard])

  const openTerminalArea = useCallback(() => {
    if (!terminalPanelToggleGuard()) return
    setTerminalInitialized(true)
    setTerminalOpen(true)
  }, [terminalPanelToggleGuard])

  return {
    closeTerminalArea,
    effectiveTerminalOpen,
    openTerminalArea,
    terminalInitialized,
    terminalOpen,
    toggleTerminalArea,
  }
}
