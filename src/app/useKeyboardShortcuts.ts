import { useMemo } from 'react'
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
  })

  const bindings = useMemo(() => resolveShortcutBindings(shortcutOverrides), [shortcutOverrides])
  const definitions = useMemo<UseHotkeyDefinition[]>(() => {
    const execute = (action: ShortcutActionId) => {
      const {
        activeTabId: currentActiveTabId,
        tabs: currentTabs,
        viewMode: currentViewMode,
        onCloseActiveTab: closeActiveTab,
        onCreateFile: createFile,
        onOpenCommandPalette: openCommandPalette,
        onOpenFile: openFile,
        onOpenProject: openProject,
        onOpenSettings: openSettings,
        onOpenTab: openTab,
        onSetViewMode: setViewMode,
        onToggleRightSidebar: toggleRightSidebar,
        onToggleSidebar: toggleSidebar,
      } = argsRef.current

      if (action === 'app.commandPalette') {
        openCommandPalette()
        return
      }
      if (action === 'app.settings') {
        openSettings()
        return
      }
      if (action === 'file.new') {
        createFile()
        return
      }
      if (action === 'file.openProject') {
        openProject()
        return
      }
      if (action === 'file.openFile') {
        openFile()
        return
      }
      if (action === 'tab.next' || action === 'tab.previous') {
        openAdjacentTab(action, {
          activeTabId: currentActiveTabId,
          onOpenTab: openTab,
          tabs: currentTabs,
        })
        return
      }
      if (action === 'tab.close') {
        closeActiveTab()
        return
      }
      if (action === 'view.wysiwyg') {
        setViewMode('wysiwyg')
        return
      }
      if (action === 'view.source') {
        setViewMode('source')
        return
      }
      if (action === 'view.graph') {
        setViewMode('graph')
        return
      }
      if (action === 'view.toggleSource') {
        setViewMode(currentViewMode === 'source' ? 'wysiwyg' : 'source')
        return
      }
      if (action === 'view.toggleSidebar') {
        toggleSidebar()
        return
      }
      if (action === 'view.toggleRightSidebar') {
        toggleRightSidebar()
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
  }, [argsRef, bindings])

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
