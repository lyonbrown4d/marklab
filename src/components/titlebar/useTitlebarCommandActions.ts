import { useCallback, useMemo } from 'react'
import { themeFromActionId, themeModeFromActionId } from '@/logic/themes'
import {
  isAppActionEnabled,
  isAppActionId,
  isDispatchableAppActionId,
  runAppAction,
  type AppActionHandlers,
} from '@/logic/appActionCatalog'
import { isDesktopRuntime } from '@/runtime/window'
import { appApi } from '@/services/appApi'
import type { FsSearchResult } from '@/services/fsApi'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { requestFileSearchFocus } from '@/utils/appEvents'
import type { TitlebarProps } from '@/components/titlebar/titlebarTypes'

type UseTitlebarCommandActionsArgs = Pick<
  TitlebarProps,
  | 'onChangeView'
  | 'onSelectProject'
  | 'onSelectSingleFile'
  | 'onCreateFile'
  | 'onCreateFolder'
  | 'onCloseActiveTab'
  | 'onToggleSidebar'
  | 'onToggleRightSidebar'
  | 'onOpenSettings'
  | 'onOpenWorkspaceGraph'
  | 'onOpenTerminal'
  | 'onRebuildSearchIndex'
  | 'onOpenFile'
  | 'onOpenHeading'
  | 'onOpenSearchResult'
  | 'onOpenAllPages'
  | 'onToggleReadOnly'
  | 'setTheme'
  | 'canCreateWorkspaceEntries'
> & {
  onCommandOpenChange: (open: boolean) => void
  onOpenCurrentWorkspaceInNewWindow: () => void
}

export const useTitlebarCommandActions = ({
  onCommandOpenChange,
  onChangeView,
  onSelectProject,
  onSelectSingleFile,
  onCreateFile,
  onCreateFolder,
  onCloseActiveTab,
  onToggleSidebar,
  onToggleRightSidebar,
  onOpenSettings,
  onOpenWorkspaceGraph,
  onOpenTerminal,
  onRebuildSearchIndex,
  onOpenFile,
  onOpenHeading,
  onOpenSearchResult,
  onOpenAllPages,
  onToggleReadOnly,
  setTheme,
  canCreateWorkspaceEntries,
  onOpenCurrentWorkspaceInNewWindow,
}: UseTitlebarCommandActionsArgs) => {
  const onMenuAction = useCallback(
    (id: string) => {
      if (!isDesktopRuntime()) return
      if (id === 'window.open_current_workspace_in_new_window') {
        onOpenCurrentWorkspaceInNewWindow()
        return
      }
      void appApi.menuDispatch(id)
    },
    [onOpenCurrentWorkspaceInNewWindow],
  )

  const onFocusFileSearch = useCallback(() => requestFileSearchFocus(), [])

  const onOpenSearch = useCallback(() => {
    onCommandOpenChange(true)
  }, [onCommandOpenChange])

  const actionHandlers = useMemo(
    () =>
      ({
        'file.export_docx': () => onMenuAction('file.export_docx'),
        'file.export_html': () => onMenuAction('file.export_html'),
        'file.export_pdf': () => onMenuAction('file.export_pdf'),
        'file.new': onCreateFile,
        'file.new_folder': onCreateFolder,
        'file.open_file': onSelectSingleFile,
        'file.open_project': onSelectProject,
        'help.about': () => onMenuAction('help.about'),
        'settings.open': onOpenSettings,
        'tab.close': onCloseActiveTab,
        'view.focus_file_search': onFocusFileSearch,
        'view.source': () => onChangeView('source'),
        'view.toggle_readonly': onToggleReadOnly,
        'view.toggle_right_sidebar': onToggleRightSidebar,
        'view.toggle_sidebar': onToggleSidebar,
        'view.toggle_status_bar': () => {
          const preferences = usePreferencesStore.getState()
          preferences.setShowEditorStatusBar(!preferences.showEditorStatusBar)
        },
        'view.wysiwyg': () => onChangeView('wysiwyg'),
        'window.open_current_workspace_in_new_window': () =>
          onMenuAction('window.open_current_workspace_in_new_window'),
      }) satisfies AppActionHandlers,
    [
      onChangeView,
      onCloseActiveTab,
      onCreateFile,
      onCreateFolder,
      onFocusFileSearch,
      onMenuAction,
      onOpenSettings,
      onSelectProject,
      onSelectSingleFile,
      onToggleReadOnly,
      onToggleRightSidebar,
      onToggleSidebar,
    ],
  )

  const onCommandAction = useCallback(
    (id: string) => {
      onCommandOpenChange(false)
      if (isAppActionId(id)) {
        if (isDispatchableAppActionId(id)) {
          runAppAction(id, actionHandlers, isAppActionEnabled(id, canCreateWorkspaceEntries))
        }
        return
      }
      if (id === 'workspace.open_graph') {
        onOpenWorkspaceGraph()
        return
      }
      if (id === 'workspace.open_pages') {
        onOpenAllPages()
        return
      }
      if (id.startsWith('collection.open:')) {
        onOpenAllPages(id.replace('collection.open:', ''))
        return
      }
      if (id === 'terminal.open') {
        onOpenTerminal()
        return
      }
      if (id === 'workspace.rebuild_search_index') {
        onRebuildSearchIndex()
        return
      }
      const themeMode = themeModeFromActionId(id)
      if (themeMode) {
        usePreferencesStore.getState().setThemeMode(themeMode)
        return
      }
      const selectedTheme = themeFromActionId(id)
      if (selectedTheme) {
        setTheme(selectedTheme)
        return
      }
    },
    [
      actionHandlers,
      canCreateWorkspaceEntries,
      onOpenTerminal,
      onOpenAllPages,
      onOpenWorkspaceGraph,
      onRebuildSearchIndex,
      onCommandOpenChange,
      setTheme,
    ],
  )

  const onCommandOpenFile = useCallback(
    (path: string) => {
      onCommandOpenChange(false)
      onOpenFile(path)
    },
    [onCommandOpenChange, onOpenFile],
  )

  const onCommandOpenHeading = useCallback(
    (path: string, slug: string) => {
      onCommandOpenChange(false)
      onOpenHeading(path, slug)
    },
    [onCommandOpenChange, onOpenHeading],
  )

  const onCommandOpenSearchResult = useCallback(
    (result: FsSearchResult) => {
      onCommandOpenChange(false)
      onOpenSearchResult(result)
    },
    [onCommandOpenChange, onOpenSearchResult],
  )

  return {
    onMenuAction,
    onOpenSearch,
    onCommandAction,
    onCommandOpenFile,
    onCommandOpenHeading,
    onCommandOpenSearchResult,
  }
}
