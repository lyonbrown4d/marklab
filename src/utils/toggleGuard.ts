export type ToggleGuard = () => boolean

export const PANEL_TOGGLE_GUARD_MS = 260

export const createToggleGuard = (intervalMs: number): ToggleGuard => {
  let lastToggleTs = 0

  return () => {
    const now = Date.now()
    if (now - lastToggleTs < intervalMs) {
      return false
    }

    lastToggleTs = now
    return true
  }
}
