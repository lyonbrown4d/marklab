import { useMemo } from 'react'
import type { AppPlatform } from '@/services/appApi'
import { useI18n } from '@/i18n/useI18n'
import { buildAllPagesRows } from '@/logic/allPages'
import { buildWorkspaceKnowledgeSummary } from '@/logic/knowledge'
import {
  builtInMarkdownCollections,
  summarizeMarkdownCollections,
} from '@/logic/markdownCollections'
import { createFileLabel } from '@/logic/paths'
import { formatShortcutList, resolveShortcutBindings } from '@/logic/shortcuts'
import { builtInThemes, themeActionId, themeModeActionId } from '@/logic/themes'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import type { TitlebarProps } from '@/components/titlebar/titlebarTypes'
import { useTitlebarCommandActions } from '@/components/titlebar/useTitlebarCommandActions'
import { buildTitlebarCommandNavigationModel } from '@/components/titlebar/titlebarCommandNavigation'

type UseTitlebarCommandModelArgs = Pick<
  TitlebarProps,
  | 'activePath'
  | 'files'
  | 'tabs'
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
  | 'onOpenAllPages'
  | 'setTheme'
> & {
  platform: AppPlatform
}

export const useTitlebarCommandModel = ({
  activePath,
  files,
  tabs,
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
  onOpenAllPages,
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
    const fileTreePaths = files.filter((file) => file.kind === 'file').map((file) => file.path)
    const paths = workspaceIndex
      ? Array.from(new Set([...workspaceIndex.files.map((file) => file.path), ...fileTreePaths]))
      : fileTreePaths

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

  const commandNavigation = useMemo(
    () => buildTitlebarCommandNavigationModel(activePath, workspaceIndex),
    [activePath, workspaceIndex],
  )

  const commandRecentFiles = useMemo(() => {
    const seen = new Set<string>()
    return [...tabs].reverse().flatMap((tab) => {
      if (tab.kind !== 'file' || seen.has(tab.path)) return []
      seen.add(tab.path)
      return [{ path: tab.path, label: createFileLabel(tab.path) }]
    })
  }, [tabs])

  const workspaceKnowledgeSummary = useMemo(
    () => buildWorkspaceKnowledgeSummary(workspaceIndex),
    [workspaceIndex],
  )
  const commandCollections = useMemo(
    () =>
      summarizeMarkdownCollections(
        buildAllPagesRows(files, workspaceIndex),
        builtInMarkdownCollections,
      ),
    [files, workspaceIndex],
  )

  const commandPaletteShortcut = useMemo(() => {
    const hotkeyPlatform =
      platform === 'macos' ? 'mac' : platform === 'windows' ? 'windows' : 'linux'
    const bindings = resolveShortcutBindings(shortcutOverrides)
    return formatShortcutList(bindings['app.commandPalette'], hotkeyPlatform)
  }, [platform, shortcutOverrides])

  const {
    onMenuAction,
    onOpenSearch,
    onCommandAction,
    onCommandOpenFile,
    onCommandOpenHeading,
    onCommandOpenSearchResult,
  } = useTitlebarCommandActions({
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
  })

  return {
    menuGroups,
    commandFiles,
    commandHeadings,
    commandNavigationHeadings: commandNavigation.headings,
    commandNavigationBacklinks: commandNavigation.backlinks,
    commandNavigationMissingLinks: commandNavigation.missingLinks,
    commandRecentFiles,
    workspaceKnowledgeSummary,
    commandCollections,
    commandPaletteShortcut,
    onMenuAction,
    onOpenSearch,
    onCommandAction,
    onCommandOpenFile,
    onCommandOpenHeading,
    onCommandOpenSearchResult,
  }
}
