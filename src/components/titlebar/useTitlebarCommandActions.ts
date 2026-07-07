import { useCallback } from 'react'
import { themeFromActionId, themeModeFromActionId } from '@/logic/themes'
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
  | 'setTheme'
  | 'canCreateWorkspaceEntries'
> & {
  onCommandOpenChange: (open: boolean) => void
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
  setTheme,
  canCreateWorkspaceEntries,
}: UseTitlebarCommandActionsArgs) => {
  const onMenuAction = useCallback((id: string) => {
    if (!isDesktopRuntime()) return
    if (id === 'window.open_current_workspace_in_new_window') {
      void appApi.openCurrentWorkspaceInNewWindow()
      return
    }
    void appApi.menuDispatch(id)
  }, [])

  const onFocusFileSearch = useCallback(() => requestFileSearchFocus(), [])

  const onOpenSearch = useCallback(() => {
    onCommandOpenChange(true)
  }, [onCommandOpenChange])

  const onCommandAction = useCallback(
    (id: string) => {
      onCommandOpenChange(false)
      if (id === 'view.wysiwyg') {
        onChangeView('wysiwyg')
        return
      }
      if (id === 'view.source') {
        onChangeView('source')
        return
      }
      if (id === 'view.graph') {
        onChangeView('graph')
        return
      }
      if (id === 'file.open_project') {
        onSelectProject()
        return
      }
      if (id === 'file.open_file') {
        onSelectSingleFile()
        return
      }
      if (id === 'file.new') {
        if (canCreateWorkspaceEntries) onCreateFile()
        return
      }
      if (id === 'file.new_folder') {
        if (canCreateWorkspaceEntries) onCreateFolder()
        return
      }
      if (id === 'window.open_current_workspace_in_new_window') {
        onMenuAction(id)
        return
      }
      if (id === 'tab.close') {
        onCloseActiveTab()
        return
      }
      if (id === 'view.toggle_sidebar') {
        onToggleSidebar()
        return
      }
      if (id === 'view.toggle_right_sidebar') {
        onToggleRightSidebar()
        return
      }
      if (id === 'view.focus_file_search') {
        onFocusFileSearch()
        return
      }
      if (id === 'settings.open') {
        onOpenSettings()
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
      if (id === 'help.about' || id.startsWith('file.export_')) {
        onMenuAction(id)
      }
    },
    [
      canCreateWorkspaceEntries,
      onChangeView,
      onCloseActiveTab,
      onCreateFile,
      onCreateFolder,
      onFocusFileSearch,
      onMenuAction,
      onOpenSettings,
      onOpenTerminal,
      onOpenAllPages,
      onOpenWorkspaceGraph,
      onRebuildSearchIndex,
      onSelectProject,
      onSelectSingleFile,
      onToggleRightSidebar,
      onToggleSidebar,
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
