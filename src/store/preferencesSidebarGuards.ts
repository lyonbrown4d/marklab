import { createToggleGuard, PANEL_TOGGLE_GUARD_MS } from '@/utils/toggleGuard'

export const preferencesSidebarGuards = {
  left: createToggleGuard(PANEL_TOGGLE_GUARD_MS),
  right: createToggleGuard(PANEL_TOGGLE_GUARD_MS),
}
