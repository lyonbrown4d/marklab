import { useCallback, useMemo } from 'react'
import type { AppPlatform } from '@/services/appApi'
import { appApi } from '@/services/appApi'
import type { FsSearchResult } from '@/services/fsApi'
import { useI18n } from '@/i18n/useI18n'
import { buildWorkspaceKnowledgeSummary } from '@/logic/knowledge'
import { createFileLabel } from '@/logic/paths'
import { formatShortcutList, resolveShortcutBindings } from '@/logic/shortcuts'
import {
  builtInThemes,
  themeActionId,
  themeFromActionId,
  themeModeActionId,
  themeModeFromActionId,
} from '@/logic/themes'
import { isDesktopRuntime } from '@/runtime/window'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { requestFileSearchFocus } from '@/utils/appEvents'
import type { TitlebarProps } from '@/components/titlebar/titlebarTypes'

type UseTitlebarCommandModelArgs = Pick<
  TitlebarProps,
  | 'files'
  | 'workspaceIndex'
  | 'onCommandOpenChange'
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
  | 'setTheme'
> & {
  platform: AppPlatform
}

export const useTitlebarCommandModel = ({
  files,
  workspaceIndex,
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
  setTheme,
  platform,
}: UseTitlebarCommandModelArgs) => {
  const { t } = useI18n()
  const shortcutOverrides = usePreferencesStore((state) => state.shortcutOverrides)

  const menuGroups = useMemo(
    () => [
      {
        label: t('menu.file'),
        items: [
          { id: 'file.new', label: t('sidebar.newFile') },
          { id: 'window.open_current_workspace_in_new_window', label: t('actions.newWindow') },
          { id: 'file.open_project', label: t('actions.openProject') },
          { id: 'file.open_file', label: t('actions.openFile') },
          { id: 'file.export_pdf', label: t('actions.exportPdf') },
          { id: 'file.export_docx', label: t('actions.exportDocx') },
          { id: 'file.export_html', label: t('actions.exportHtml') },
        ],
      },
      {
        label: t('menu.edit'),
        items: [
          { id: 'edit.undo', label: t('edit.undo') },
          { id: 'edit.redo', label: t('edit.redo') },
          { id: 'edit.cut', label: t('edit.cut') },
          { id: 'edit.copy', label: t('edit.copy') },
          { id: 'edit.paste', label: t('edit.paste') },
          { id: 'edit.select_all', label: t('edit.selectAll') },
        ],
      },
      {
        label: t('menu.view'),
        items: [
          { id: 'view.wysiwyg', label: t('editor.modeWysiwyg') },
          { id: 'view.source', label: t('editor.modeSource') },
          { id: 'view.graph', label: t('tabs.workspaceGraph') },
          { id: 'view.toggle_sidebar', label: t('actions.toggleSidebar') },
          { id: 'view.toggle_right_sidebar', label: t('actions.toggleRightSidebar') },
        ],
      },
      {
        label: t('menu.theme'),
        items: [
          { id: themeModeActionId('system'), label: t('themeMode.system') },
          { id: themeModeActionId('light'), label: t('themeMode.light') },
          { id: themeModeActionId('dark'), label: t('themeMode.dark') },
          ...builtInThemes.map((item) => ({
            id: themeActionId(item.value),
            label: t(item.labelKey),
          })),
        ],
      },
      {
        label: t('menu.help'),
        items: [{ id: 'help.about', label: t('actions.about') }],
      },
    ],
    [t],
  )

  const commandFiles = useMemo(() => {
    const paths = workspaceIndex
      ? workspaceIndex.files.map((file) => file.path)
      : files.filter((file) => file.kind === 'file').map((file) => file.path)

    return paths.map((path) => ({
      path,
      label: createFileLabel(path),
    }))
  }, [files, workspaceIndex])

  const commandHeadings = useMemo(() => {
    if (!workspaceIndex) return []
    return workspaceIndex.files.flatMap((file) =>
      file.headings.map((heading) => ({
        path: file.path,
        slug: heading.slug,
        text: heading.text,
        level: heading.level,
        label: createFileLabel(file.path),
      })),
    )
  }, [workspaceIndex])

  const workspaceKnowledgeSummary = useMemo(
    () => buildWorkspaceKnowledgeSummary(workspaceIndex),
    [workspaceIndex],
  )

  const commandPaletteShortcut = useMemo(() => {
    const hotkeyPlatform =
      platform === 'macos' ? 'mac' : platform === 'windows' ? 'windows' : 'linux'
    const bindings = resolveShortcutBindings(shortcutOverrides)
    return formatShortcutList(bindings['app.commandPalette'], hotkeyPlatform)
  }, [platform, shortcutOverrides])

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
        onCreateFile()
        return
      }
      if (id === 'file.new_folder') {
        onCreateFolder()
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
      onChangeView,
      onCloseActiveTab,
      onCreateFile,
      onCreateFolder,
      onFocusFileSearch,
      onMenuAction,
      onOpenSettings,
      onOpenTerminal,
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
    menuGroups,
    commandFiles,
    commandHeadings,
    workspaceKnowledgeSummary,
    commandPaletteShortcut,
    onMenuAction,
    onOpenSearch,
    onCommandAction,
    onCommandOpenFile,
    onCommandOpenHeading,
    onCommandOpenSearchResult,
  }
}
