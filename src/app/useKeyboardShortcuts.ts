import { useMemo } from 'react'
import {
  useHotkeys,
  type RegisterableHotkey,
  type UseHotkeyDefinition,
} from '@tanstack/react-hotkeys'
import {
  resolveShortcutBindings,
  shortcutActions,
  type ShortcutActionId,
  type ShortcutBindings,
} from '@/logic/shortcuts'
import type { ViewMode, WorkspaceTab } from '@/store/useAppStore'
import { getWorkspaceTabId } from '@/logic/tabs'

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
}: UseKeyboardShortcutsArgs) => {
  const bindings = useMemo(() => resolveShortcutBindings(shortcutOverrides), [shortcutOverrides])
  const definitions = useMemo<UseHotkeyDefinition[]>(() => {
    const execute = (action: ShortcutActionId) => {
      if (action === 'app.commandPalette') {
        onOpenCommandPalette()
        return
      }
      if (action === 'app.settings') {
        onOpenSettings()
        return
      }
      if (action === 'file.new') {
        onCreateFile()
        return
      }
      if (action === 'file.openProject') {
        onOpenProject()
        return
      }
      if (action === 'file.openFile') {
        onOpenFile()
        return
      }
      if (action === 'tab.next' || action === 'tab.previous') {
        openAdjacentTab(action, { activeTabId, onOpenTab, tabs })
        return
      }
      if (action === 'tab.close') {
        onCloseActiveTab()
        return
      }
      if (action === 'view.wysiwyg') {
        onSetViewMode('wysiwyg')
        return
      }
      if (action === 'view.source') {
        onSetViewMode('source')
        return
      }
      if (action === 'view.graph') {
        onSetViewMode('graph')
        return
      }
      if (action === 'view.toggleSource') {
        onSetViewMode(viewMode === 'source' ? 'wysiwyg' : 'source')
        return
      }
      if (action === 'view.toggleSidebar') {
        onToggleSidebar()
        return
      }
      if (action === 'view.toggleRightSidebar') {
        onToggleRightSidebar()
      }
    }

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
  }, [
    activeTabId,
    bindings,
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
    tabs,
    viewMode,
  ])

  useHotkeys(definitions, {
    conflictBehavior: 'replace',
    ignoreInputs: false,
    preventDefault: true,
    stopPropagation: true,
  })
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
