type ToggleSidebarFromShortcutArgs = {
  isCollapsed: () => boolean
  toggleSidebar: () => void
  requestFocus: () => void
  scheduleFocus: (callback: () => void) => unknown
}

export const toggleSidebarFromShortcut = ({
  isCollapsed,
  toggleSidebar,
  requestFocus,
  scheduleFocus,
}: ToggleSidebarFromShortcutArgs) => {
  const wasCollapsed = isCollapsed()
  toggleSidebar()
  if (!wasCollapsed || isCollapsed()) return
  scheduleFocus(requestFocus)
}
