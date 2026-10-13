import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  useHotkeys,
  parseHotkey,
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
import { useVimKeyboardOwnership } from '@/app/useVimKeyboardOwnership'
import { isVimKeyboardTarget } from '@/components/vim/vimKeyboardScope'
import { isImeKeyboardEvent } from '@/logic/ime'
import { nextTabInMru, updateTabMru } from '@/app/workspaceTabMru'

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
  onNavigateBack: () => void
  onNavigateForward: () => void
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
  onNavigateBack,
  onNavigateForward,
}: UseKeyboardShortcutsArgs) => {
  const vimFocused = useVimKeyboardOwnership()
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
    onNavigateBack,
    onNavigateForward,
  })
  const tabMruRef = useRef<string[]>([])
  const tabMruCycleRef = useRef<readonly string[] | null>(null)
  const tabIds = useMemo(() => tabs.map(getWorkspaceTabId), [tabs])

  useEffect(() => {
    if (tabMruCycleRef.current) {
      const available = new Set(tabIds)
      tabMruCycleRef.current = tabMruCycleRef.current.filter((id) => available.has(id))
    }
    tabMruRef.current = updateTabMru(
      tabMruRef.current,
      tabIds,
      tabMruCycleRef.current ? null : activeTabId,
    )
  }, [activeTabId, tabIds])

  const finishTabMruCycle = useCallback(() => {
    if (!tabMruCycleRef.current) return
    tabMruCycleRef.current = null
    const current = argsRef.current
    tabMruRef.current = updateTabMru(
      tabMruRef.current,
      current.tabs.map(getWorkspaceTabId),
      current.activeTabId,
    )
  }, [argsRef])

  useEffect(() => {
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Control' || event.key === 'Meta') finishTabMruCycle()
    }
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', finishTabMruCycle)
    return () => {
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', finishTabMruCycle)
    }
  }, [finishTabMruCycle])

  const bindings = useMemo(() => resolveShortcutBindings(shortcutOverrides), [shortcutOverrides])
  const execute = useCallback(
    (action: ShortcutActionId) => {
      const current = argsRef.current
      if (action === 'tab.next' || action === 'tab.previous') {
        const cycle = tabMruCycleRef.current ?? [...tabMruRef.current]
        tabMruCycleRef.current = cycle
        const target = nextTabInMru(cycle, current.activeTabId, action === 'tab.next' ? 1 : -1)
        if (target) current.onOpenTab(target)
        return
      }
      executeShortcutAction(action, current)
    },
    [argsRef],
  )
  const definitions = useMemo<UseHotkeyDefinition[]>(() => {
    return shortcutActions
      .filter((action) => action.scope === 'app')
      .flatMap((action) =>
        bindings[action.id].map((hotkey) => ({
          hotkey: hotkey as RegisterableHotkey,
          callback: (event) => {
            if (
              event &&
              (isImeKeyboardEvent(event) ||
                (isVimKeyboardTarget(event.target) && event.defaultPrevented))
            )
              return
            event?.preventDefault()
            event?.stopPropagation()
            execute(action.id)
          },
          options: {
            ignoreInputs:
              vimFocused ||
              action.id === 'navigation.back' ||
              action.id === 'navigation.forward' ||
              action.id === 'view.toggleSidebar' ||
              parseHotkey(hotkey).ctrl ||
              parseHotkey(hotkey).meta ||
              hotkey === 'Escape'
                ? false
                : true,
            meta: { name: action.id },
          },
        })),
      )
  }, [bindings, execute, vimFocused])

  useWebTabShortcutBridge({ activeTabId, bindings, execute })

  useHotkeys(definitions, {
    conflictBehavior: 'replace',
    preventDefault: false,
    stopPropagation: false,
  })
}

const executeShortcutAction = (action: ShortcutActionId, args: UseKeyboardShortcutsArgs) => {
  const {
    viewMode,
    onCloseActiveTab,
    onCreateFile,
    onOpenCommandPalette,
    onOpenFile,
    onOpenProject,
    onOpenSettings,
    onSetViewMode,
    onToggleRightSidebar,
    onToggleSidebar,
    onToggleTerminal,
    onToggleReadOnly,
    onNavigateBack,
    onNavigateForward,
  } = args

  if (action === 'app.commandPalette') return onOpenCommandPalette()
  if (action === 'app.settings') return onOpenSettings()
  if (action === 'file.new') return onCreateFile()
  if (action === 'file.openProject') return onOpenProject()
  if (action === 'file.openFile') return onOpenFile()
  if (action === 'navigation.back') return onNavigateBack()
  if (action === 'navigation.forward') return onNavigateForward()
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
