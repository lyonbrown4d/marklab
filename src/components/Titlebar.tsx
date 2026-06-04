import {
  Code2,
  FileText,
  FolderOpen,
  GitGraph,
  PanelLeft,
  PanelRight,
  Search,
  Settings2,
} from 'lucide-react'
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { Button } from '@/components/ui/button'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { FileEntry, ThemeMode, ViewMode, WorkspaceTab } from '@/store/useAppStore'
import type { SaveState } from '@/app/useEditorBuffer'
import { useI18n } from '@/i18n/useI18n'
import { appApi, type AppPlatform } from '@/services/appApi'
import AppMenuBar from '@/components/AppMenuBar'
import AppLogo from '@/components/AppLogo'
import { inferPlatformFromUserAgent } from '@/runtime/environment'
import { getCurrentRuntimeWindow, isDesktopRuntime } from '@/runtime/window'
import type { FsSearchResult, FsWorkspaceIndex } from '@/services/fsApi'
import { createFileLabel } from '@/logic/paths'
import TitlebarCommandDialog from '@/components/TitlebarCommandDialog'
import WindowControls from '@/components/WindowControls'
import TitlebarThemeMenu from '@/components/TitlebarThemeMenu'
import { useAppStore } from '@/store/useAppStore'
import { formatShortcutList, resolveShortcutBindings } from '@/logic/shortcuts'
import { requestFileSearchFocus } from '@/utils/appEvents'

type TitlebarProps = {
  activePath: string | null
  activeTab: WorkspaceTab | null
  dirtyPaths: Record<string, true>
  saveStates: Record<string, SaveState>
  silentSave: boolean
  onToggleSidebar: () => void
  onToggleRightSidebar: () => void
  onSelectProject: () => void
  onSelectSingleFile: () => void
  onCreateFile: () => void
  onCreateFolder: () => void
  onOpenFile: (path: string) => void
  onOpenHeading: (path: string, slug: string) => void
  onOpenSearchResult: (result: FsSearchResult) => void
  onOpenWorkspaceGraph: () => void
  onCloseActiveTab: () => void
  onOpenTerminal: () => void
  onRebuildSearchIndex: () => void
  onChangeView: (mode: ViewMode) => void
  files: FileEntry[]
  workspaceIndex: FsWorkspaceIndex | null
  canCreateWorkspaceEntries: boolean
  searchIndexRebuilding: boolean
  isMaximized: boolean
  setIsMaximized: (value: boolean) => void
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  commandOpen: boolean
  onCommandOpenChange: (open: boolean) => void
  onOpenSettings: () => void
}

const getActiveTabLabel = (tab: WorkspaceTab | null) => {
  if (!tab) return ''
  if (tab.kind === 'workspace-graph') return 'Workspace Graph'
  const label = createFileLabel(tab.path)
  if (tab.kind === 'git-diff') return `${label} · Diff`
  if (tab.view === 'source') return `${label} · Source`
  if (tab.view === 'graph') return `${label} · Graph`
  return label
}

const getActiveTabTitle = (tab: WorkspaceTab | null, activePath: string | null) => {
  if (!tab) return ''
  if (tab.kind === 'workspace-graph') return 'Workspace Graph'
  if (tab.kind === 'git-diff') return tab.path
  return activePath ?? tab.path
}

const renderActiveTabIcon = (tab: WorkspaceTab | null) => {
  if (!tab) return <FileText className="h-3.5 w-3.5" />
  if (tab.kind === 'workspace-graph' || tab.kind === 'git-diff') {
    return <GitGraph className="h-3.5 w-3.5" />
  }
  if (tab.view === 'source') return <Code2 className="h-3.5 w-3.5" />
  if (tab.view === 'graph') return <GitGraph className="h-3.5 w-3.5" />
  return <FileText className="h-3.5 w-3.5" />
}

const Titlebar = ({
  activePath,
  activeTab,
  dirtyPaths,
  saveStates,
  silentSave,
  onToggleSidebar,
  onToggleRightSidebar,
  onSelectProject,
  onSelectSingleFile,
  onCreateFile,
  onCreateFolder,
  onOpenFile,
  onOpenHeading,
  onOpenSearchResult,
  onOpenWorkspaceGraph,
  onCloseActiveTab,
  onOpenTerminal,
  onRebuildSearchIndex,
  onChangeView,
  files,
  workspaceIndex,
  canCreateWorkspaceEntries,
  searchIndexRebuilding,
  isMaximized,
  setIsMaximized,
  theme,
  setTheme,
  commandOpen,
  onCommandOpenChange,
  onOpenSettings,
}: TitlebarProps) => {
  const getAppWindow = useCallback(async () => {
    return getCurrentRuntimeWindow()
  }, [])
  const { t } = useI18n()
  const [platform, setPlatform] = useState<AppPlatform>(inferPlatformFromUserAgent())
  const shortcutOverrides = useAppStore((state) => state.shortcutOverrides)
  const isWindows =
    typeof window !== 'undefined' && window.navigator.userAgent.toLowerCase().includes('windows')
  const showInlineMenu = platform === 'windows' || platform === 'linux'
  const activeTabLabel = getActiveTabLabel(activeTab)
  const activeTabTitle = getActiveTabTitle(activeTab, activePath)
  const activeSaveState = activePath ? saveStates[activePath] : undefined
  const showDirtyIndicator = Boolean(activePath && !silentSave && dirtyPaths[activePath])
  const showErrorIndicator = activeSaveState?.status === 'error'
  const dirtyLabel = t('save.unsaved')
  const errorLabel = t('save.error')

  useEffect(() => {
    if (!isDesktopRuntime()) return
    void appApi
      .getPlatform()
      .then((next) => setPlatform(next))
      .catch(() => {})
  }, [])
  const menuGroups = useMemo(
    () => [
      {
        label: 'File',
        items: [
          { id: 'file.new', label: 'New File' },
          { id: 'window.open_current_workspace_in_new_window', label: 'New Window' },
          { id: 'file.open_project', label: t('actions.openProject') },
          { id: 'file.open_file', label: t('actions.openFile') },
          { id: 'file.export_pdf', label: t('actions.exportPdf') },
          { id: 'file.export_docx', label: t('actions.exportDocx') },
          { id: 'file.export_html', label: t('actions.exportHtml') },
        ],
      },
      {
        label: 'Edit',
        items: [
          { id: 'edit.undo', label: 'Undo' },
          { id: 'edit.redo', label: 'Redo' },
          { id: 'edit.cut', label: 'Cut' },
          { id: 'edit.copy', label: 'Copy' },
          { id: 'edit.paste', label: 'Paste' },
          { id: 'edit.select_all', label: 'Select All' },
        ],
      },
      {
        label: 'View',
        items: [
          { id: 'view.wysiwyg', label: t('editor.modeWysiwyg') },
          { id: 'view.source', label: t('editor.modeSource') },
          { id: 'view.graph', label: t('tabs.workspaceGraph') },
          { id: 'view.toggle_sidebar', label: t('actions.toggleSidebar') },
          { id: 'view.toggle_right_sidebar', label: t('actions.toggleRightSidebar') },
        ],
      },
      {
        label: 'Theme',
        items: [
          { id: 'theme.light', label: t('theme.light') },
          { id: 'theme.dark', label: t('theme.dark') },
          { id: 'theme.marko-light', label: t('theme.markoLight') },
          { id: 'theme.marko-dark', label: t('theme.markoDark') },
        ],
      },
      {
        label: 'Help',
        items: [{ id: 'help.about', label: 'About marklab' }],
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
      if (
        id === 'theme.light' ||
        id === 'theme.dark' ||
        id === 'theme.marko-light' ||
        id === 'theme.marko-dark'
      ) {
        setTheme(id as ThemeMode)
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
      onOpenTerminal,
      onOpenWorkspaceGraph,
      onRebuildSearchIndex,
      onSelectProject,
      onSelectSingleFile,
      onToggleRightSidebar,
      onToggleSidebar,
      onCommandOpenChange,
      onOpenSettings,
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

  const isMacDesktop = platform === 'macos' && isDesktopRuntime()

  const handleTitlebarMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      if (!isDesktopRuntime() || platform !== 'macos') return
      if (e.button !== 0) return
      const target = e.target as HTMLElement
      if (
        target.closest(
          'button, a, input, select, textarea, [role="button"], [role="menuitem"], [data-no-drag]',
        )
      )
        return
      void getAppWindow().then((windowHandle) => windowHandle?.startDragging())
    },
    [getAppWindow, platform],
  )

  return (
    <header
      className={`app-titlebar flex h-11 items-center justify-between border-b border-border/80 px-2.5 ${isMacDesktop ? 'pl-[68px]' : ''}`}
      onMouseDown={handleTitlebarMouseDown}
    >
      <TooltipProvider>
        <div className="flex min-w-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleSidebar}
                aria-label={t('actions.toggleSidebar')}
                className="chrome-button h-8 w-8 rounded-md"
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('actions.toggleSidebar')}</TooltipContent>
          </Tooltip>
          <div className="flex min-w-0 items-center gap-2 px-1 leading-none">
            <AppLogo className="h-6 w-6 rounded-md shadow-sm" />
            <div className="truncate text-sm font-semibold tracking-[0.01em]">{t('app.name')}</div>
          </div>
          {showInlineMenu && <AppMenuBar groups={menuGroups} onAction={onMenuAction} />}
        </div>
        <div className="mx-2 hidden min-w-0 flex-1 items-center justify-center gap-2 md:flex">
          {activeTab && (
            <div
              className="flex h-7 min-w-0 max-w-[240px] shrink items-center gap-1.5 rounded-md border border-border/80 bg-background/60 px-2 text-xs text-muted-foreground"
              title={activeTabTitle}
            >
              <span className="shrink-0 text-muted-foreground">
                {renderActiveTabIcon(activeTab)}
              </span>
              <span className="min-w-0 truncate text-foreground/90">{activeTabLabel}</span>
              {showDirtyIndicator && (
                <span
                  aria-label={dirtyLabel}
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                  title={dirtyLabel}
                />
              )}
              {showErrorIndicator && (
                <span
                  aria-label={errorLabel}
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive"
                  title={activeSaveState?.message ?? errorLabel}
                />
              )}
            </div>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="command-trigger h-7 min-w-[220px] max-w-md flex-1 justify-start rounded-md px-3 text-left text-xs text-muted-foreground"
            onClick={onOpenSearch}
          >
            <span className="flex w-full items-center gap-2">
              <Search className="h-3.5 w-3.5" />
              <span>{t('sidebar.search')}</span>
              <KbdGroup className="ml-auto">
                <Kbd>{commandPaletteShortcut}</Kbd>
              </KbdGroup>
            </span>
          </Button>
        </div>
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="chrome-button h-8 w-8 rounded-md"
                onClick={onSelectProject}
                aria-label={t('actions.openProject')}
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('actions.openProject')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="chrome-button h-8 w-8 rounded-md"
                onClick={onSelectSingleFile}
                aria-label={t('actions.openFile')}
              >
                <FileText className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('actions.openFile')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="chrome-button h-8 w-8 rounded-md md:hidden"
                onClick={onOpenSearch}
                aria-label={t('sidebar.searchAction')}
              >
                <Search className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('sidebar.searchAction')}</TooltipContent>
          </Tooltip>
          <TitlebarThemeMenu
            theme={theme}
            setTheme={setTheme}
            onAbout={() => onMenuAction('help.about')}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="chrome-button h-8 w-8 rounded-md"
                onClick={onOpenSettings}
                aria-label={t('menu.settings')}
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('menu.settings')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="chrome-button h-8 w-8 rounded-md"
                onClick={onToggleRightSidebar}
                aria-label={t('actions.toggleRightSidebar')}
              >
                <PanelRight className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('actions.toggleRightSidebar')}</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
      <TitlebarCommandDialog
        open={commandOpen}
        onOpenChange={onCommandOpenChange}
        files={commandFiles}
        headings={commandHeadings}
        onOpenFile={onCommandOpenFile}
        onOpenHeading={onCommandOpenHeading}
        onOpenSearchResult={onCommandOpenSearchResult}
        onAction={onCommandAction}
        canCreateWorkspaceEntries={canCreateWorkspaceEntries}
        workspaceIndexed={Boolean(workspaceIndex)}
        indexedFileCount={workspaceIndex?.files.length ?? 0}
        searchIndexRebuilding={searchIndexRebuilding}
      />
      <WindowControls
        platform={platform}
        isWindows={isWindows}
        isMaximized={isMaximized}
        setIsMaximized={setIsMaximized}
        getAppWindow={getAppWindow}
      />
    </header>
  )
}

export default memo(Titlebar)
