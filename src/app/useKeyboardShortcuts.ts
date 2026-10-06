import { useCallback, useMemo } from 'react'
import {
  useHotkeys,
  type RegisterableHotkey,
  type UseHotkeyDefinition,
} from '@tanstack/react-hotkeys'
import { useLatest } from 'ahooks'
import {
  resolveShortcutBindings,
  shortcutActions,
  type ShortcutActionId,
  type ShortcutBindings,
} from '@/logic/shortcuts'
import type { ViewMode, WorkspaceTab } from '@/store/appTypes'
import { getWorkspaceTabId } from '@/logic/tabs'
import { toggleSidebarFromShortcut } from '@/app/sidebarShortcut'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { requestFileSearchFocus } from '@/utils/appEvents'
import { useWebTabShortcutBridge } from '@/app/useWebTabShortcutBridge'

type UseKeyboardShortcutsArgs = {
  activeTabId: string | null
  shortcutOverrides: ShortcutBindings
  tabs: WorkspaceTab[]
  viewMode: ViewMode
  onCloseActiveTab: () => void
  onCreateFile: () => void
  onOpenCommandPalette: () => void
  onOpenFile: () => void
  onOpenProject: () => void
  onOpenSettings: () => void
  onOpenTab: (id: string) => void
  onSetViewMode: (mode: ViewMode) => void
  onToggleRightSidebar: () => void
  onToggleSidebar: () => void
  onToggleTerminal: () => void
  onToggleReadOnly: () => void
}

export const useKeyboardShortcuts = ({
  activeTabId,
  shortcutOverrides,
  tabs,
  viewMode,
  onCloseActiveTab,
  onCreateFile,
  onOpenCommandPalette,
  onOpenFile,
  onOpenProject,
  onOpenSettings,
  onOpenTab,
  onSetViewMode,
  onToggleRightSidebar,
  onToggleSidebar,
  onToggleTerminal,
  onToggleReadOnly,
}: UseKeyboardShortcutsArgs) => {
  const argsRef = useLatest<UseKeyboardShortcutsArgs>({
    activeTabId,
    shortcutOverrides,
    tabs,
    viewMode,
    onCloseActiveTab,
    onCreateFile,
    onOpenCommandPalette,
    onOpenFile,
    onOpenProject,
    onOpenSettings,
    onOpenTab,
    onSetViewMode,
    onToggleRightSidebar,
    onToggleSidebar,
    onToggleTerminal,
    onToggleReadOnly,
  })

  const bindings = useMemo(() => resolveShortcutBindings(shortcutOverrides), [shortcutOverrides])
  const execute = useCallback(
    (action: ShortcutActionId) => executeShortcutAction(action, argsRef.current),
    [argsRef],
  )
  const definitions = useMemo<UseHotkeyDefinition[]>(() => {
    return shortcutActions
      .filter((action) => action.scope === 'app')
      .flatMap((action) =>
        bindings[action.id].map((hotkey) => ({
          hotkey: hotkey as RegisterableHotkey,
          callback: () => execute(action.id),
          options: {
            meta: { name: action.id },
          },
        })),
      )
  }, [bindings, execute])

  useWebTabShortcutBridge({ activeTabId, bindings, execute })

  useHotkeys(definitions, {
    conflictBehavior: 'replace',
    preventDefault: true,
    stopPropagation: true,
  })
}

const executeShortcutAction = (action: ShortcutActionId, args: UseKeyboardShortcutsArgs) => {
  const {
    activeTabId,
    tabs,
    viewMode,
    onCloseActiveTab,
    onCreateFile,
    onOpenCommandPalette,
    onOpenFile,
    onOpenProject,
    onOpenSettings,
    onOpenTab,
    onSetViewMode,
    onToggleRightSidebar,
    onToggleSidebar,
    onToggleTerminal,
    onToggleReadOnly,
  } = args

  if (action === 'app.commandPalette') return onOpenCommandPalette()
  if (action === 'app.settings') return onOpenSettings()
  if (action === 'file.new') return onCreateFile()
  if (action === 'file.openProject') return onOpenProject()
  if (action === 'file.openFile') return onOpenFile()
  if (action === 'tab.next' || action === 'tab.previous') {
    return openAdjacentTab(action, { activeTabId, onOpenTab, tabs })
  }
  if (action === 'tab.close') return onCloseActiveTab()
  if (action === 'view.wysiwyg') return onSetViewMode('wysiwyg')
  if (action === 'view.source') return onSetViewMode('source')
  if (action === 'view.toggleSource') {
    return onSetViewMode(viewMode === 'source' ? 'wysiwyg' : 'source')
  }
  if (action === 'view.toggleSidebar') {
    return toggleSidebarFromShortcut({
      isCollapsed: () => usePreferencesStore.getState().sidebarCollapsed,
      toggleSidebar: onToggleSidebar,
      requestFocus: requestFileSearchFocus,
      scheduleFocus: (callback) => window.requestAnimationFrame(callback),
    })
  }
  if (action === 'view.toggleRightSidebar') return onToggleRightSidebar()
  if (action === 'view.toggleTerminal') return onToggleTerminal()
  if (action === 'view.toggleReadonly') return onToggleReadOnly()
  if (action === 'view.toggleStatusBar') {
    const preferences = usePreferencesStore.getState()
    return preferences.setShowEditorStatusBar(!preferences.showEditorStatusBar)
  }
}

const openAdjacentTab = (
  action: ShortcutActionId,
  {
    activeTabId,
    tabs,
    onOpenTab,
  }: Pick<UseKeyboardShortcutsArgs, 'activeTabId' | 'onOpenTab' | 'tabs'>,
) => {
  if (tabs.length === 0) return
  const activeIndex = activeTabId
    ? tabs.findIndex((tab) => getWorkspaceTabId(tab) === activeTabId)
    : -1
  const currentIndex = activeIndex >= 0 ? activeIndex : 0
  const direction = action === 'tab.next' ? 1 : -1
  const nextIndex = (currentIndex + direction + tabs.length) % tabs.length
  onOpenTab(getWorkspaceTabId(tabs[nextIndex]))
}
