import { useMemo } from 'react'
import type { AppPlatform } from '@/services/appApi'
import { createFileLabel } from '@/logic/paths'
import { resolveAppActionShortcut } from '@/logic/appActionCatalog'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import type { TitlebarProps } from '@/components/titlebar/titlebarTypes'
import { useTitlebarCommandActions } from '@/components/titlebar/useTitlebarCommandActions'

type UseTitlebarCommandModelArgs = Pick<
  TitlebarProps,
  | 'activePath'
  | 'files'
  | 'tabs'
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
  commandOpen: boolean
  platform: AppPlatform
  onCommandOpenChange: (open: boolean) => void
  onOpenCurrentWorkspaceInNewWindow: () => void
}

export const useTitlebarCommandModel = ({
  activePath,
  files,
  tabs,
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
  commandOpen,
  platform,
  onOpenCurrentWorkspaceInNewWindow,
}: UseTitlebarCommandModelArgs) => {
  const shortcutOverrides = usePreferencesStore((state) => state.shortcutOverrides)
  const hotkeyPlatform = platform === 'macos' ? 'mac' : platform === 'windows' ? 'windows' : 'linux'

  const commandFiles = useMemo(() => {
    if (!commandOpen) return []
    return files
      .filter((file) => file.kind === 'file')
      .map(({ path }) => ({
        path,
        label: createFileLabel(path),
      }))
  }, [commandOpen, files])

  const commandRecentFiles = useMemo(() => {
    if (!commandOpen) return []
    const seen = new Set<string>()
    const active = activePath ? [{ kind: 'file' as const, path: activePath }] : []
    return [...active, ...[...tabs].reverse()].flatMap((tab) => {
      if (tab.kind !== 'file' || seen.has(tab.path)) return []
      seen.add(tab.path)
      return [{ path: tab.path, label: createFileLabel(tab.path) }]
    })
  }, [activePath, commandOpen, tabs])

  const commandPaletteShortcut = useMemo(() => {
    return resolveAppActionShortcut('app.command_palette', shortcutOverrides, hotkeyPlatform) ?? '—'
  }, [hotkeyPlatform, shortcutOverrides])

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
    onToggleReadOnly,
    setTheme,
    canCreateWorkspaceEntries,
    onOpenCurrentWorkspaceInNewWindow,
  })

  return {
    commandFiles,
    commandRecentFiles,
    commandPaletteShortcut,
    onMenuAction,
    onOpenSearch,
    onCommandAction,
    onCommandOpenFile,
    onCommandOpenHeading,
    onCommandOpenSearchResult,
  }
}
