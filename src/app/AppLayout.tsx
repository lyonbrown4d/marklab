import { useLocation, useOutlet } from 'react-router-dom'
import SettingsDialog from '@/components/SettingsDialog'
import { useDefaultLayout, usePanelRef } from 'react-resizable-panels'
import { useQueryClient } from '@tanstack/react-query'
import Titlebar from '@/components/Titlebar'
import AppStatusBar from '@/components/AppStatusBar'
import ExportStatusOverlay from '@/components/ExportStatusOverlay'
import { useAppLayoutState } from '@/app/useAppLayoutState'
import type { GraphData } from '@/logic/graph'
import type {
  FileEntry,
  FileViewKind,
  GraphContentMode,
  ThemeMode,
  ViewMode,
  WorkspaceTab,
} from '@/store/appTypes'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { fsApi, type FsWorkspaceIndex } from '@/services/fsApi'
import { listen } from '@/runtime/events'
import { onMenuActionRequest } from '@/utils/appEvents'
import { isDesktopRuntime } from '@/runtime/environment'
import type { SaveState } from '@/app/useEditorBuffer'
import {
  requestFocusHeading,
  requestFocusSourcePosition,
  type FocusHeadingRequest,
} from '@/utils/editorNavigation'
import { useLatest } from 'ahooks'
import { useDesktopReadySignal } from '@/app/useDesktopReadySignal'
import type { GitDiffRequest } from '@/services/gitApi'
import type { FsSearchResult } from '@/services/fsApi'
import { useKeyboardShortcuts } from '@/app/useKeyboardShortcuts'
import { AppWorkspacePanels } from '@/app/AppWorkspacePanels'
import { AppShellPanels } from '@/app/AppShellPanels'
import { useAppMenuAction } from '@/app/useAppMenuAction'
import { useAppPanelLayoutSync } from '@/app/useAppPanelLayoutSync'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { useUserThemeCss } from '@/hooks/useUserThemeCss'
import { createToggleGuard, PANEL_TOGGLE_GUARD_MS } from '@/utils/toggleGuard'
import { toast } from 'sonner'

const createUntitledPath = (files: FileEntry[]) => {
  const existingPaths = new Set(
    files.filter((entry) => entry.kind === 'file').map((entry) => entry.path.toLowerCase()),
  )
  if (!existingPaths.has('untitled.md')) return 'Untitled.md'
  for (let index = 1; index <= 999; index += 1) {
    const next = `Untitled-${index}.md`
    if (!existingPaths.has(next.toLowerCase())) return next
  }
  return `Untitled-${Date.now()}.md`
}

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

export type LayoutContext = {
  activePath: string | null
  editorValue: string
  graph: GraphData
  graphLoading: boolean
  onEditorChange: (value: string) => void
  onOpenFile: (path: string) => void
  onOpenFileView: (path: string, view: FileViewKind) => void
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  files: FileEntry[]
  fileContents: Record<string, string>
  workspaceIndex: FsWorkspaceIndex | null
  saveStates: Record<string, SaveState>
  loadingPaths: Record<string, true>
  currentView: ViewMode
  activeTab: WorkspaceTab | null
  rootPath: string
  recentProjects: string[]
  showEditorStatusBar: boolean
  graphMiniMapEnabled: boolean
  graphContentMode: GraphContentMode
  onCloseActiveTab: () => void
  onOpenProject: (path: string) => void
}

const AppLayout = () => {
  const state = useAppLayoutState()
  const motionSmoothScrolling = usePreferencesStore((store) => store.motionSmoothScrolling)
  const motionAnimatedCursor = usePreferencesStore((store) => store.motionAnimatedCursor)
  const motionAnimatedPanels = usePreferencesStore((store) => store.motionAnimatedPanels)
  const customThemeId = usePreferencesStore((store) => store.customThemeId)
  const themeMode = usePreferencesStore((store) => store.themeMode)
  const syncSystemTheme = usePreferencesStore((store) => store.syncSystemTheme)
  const immersiveZenMode = usePreferencesStore((store) => store.immersiveZenMode)
  const immersiveFocusMode = usePreferencesStore((store) => store.immersiveFocusMode)
  const immersiveTypewriterMode = usePreferencesStore((store) => store.immersiveTypewriterMode)
  const stateRef = useLatest(state)
  const queryClient = useQueryClient()
  const location = useLocation()
  const stateOpenFile = state.onOpenFile
  const stateOpenFileView = state.onOpenFileView
  const stateOpenGitDiff = state.onOpenGitDiff
  const stateCreateFile = state.createFile
  const stateCreateFolder = state.createFolder
  const [pendingHeading, setPendingHeading] = useState<FocusHeadingRequest | null>(null)
  const [commandOpen, setCommandOpen] = useState(false)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [terminalInitialized, setTerminalInitialized] = useState(false)
  const [searchIndexRebuilding, setSearchIndexRebuilding] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const terminalPanelToggleGuard = useMemo(() => createToggleGuard(PANEL_TOGGLE_GUARD_MS), [])
  const effectiveTerminalOpen = terminalOpen && !immersiveZenMode
  const workspaceGroupElementRef = useRef<HTMLDivElement | null>(null)
  const shellGroupElementRef = useRef<HTMLDivElement | null>(null)
  const leftSidebarPanelRef = usePanelRef()
  const rightSidebarPanelRef = usePanelRef()
  const terminalPanelRef = usePanelRef()
  const workspacePanelLayout = useDefaultLayout({
    id: 'marklab-workspace-panels',
    panelIds: ['left-sidebar', 'workspace-main', 'right-sidebar'],
  })
  const shellPanelLayout = useDefaultLayout({
    id: 'marklab-shell-panels',
    panelIds: ['workspace-area', 'terminal'],
  })
  const openSettings = useCallback(() => {
    setSettingsOpen(true)
  }, [])
  useUserThemeCss(customThemeId)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => syncSystemTheme(media.matches ? 'dark' : 'light')
    sync()
    media.addEventListener('change', sync)
    return () => {
      media.removeEventListener('change', sync)
    }
  }, [syncSystemTheme, themeMode])
  useDesktopReadySignal()
  useAppPanelLayoutSync({
    leftSidebarPanelRef,
    rightSidebarPanelRef,
    terminalPanelRef,
    workspaceGroupElementRef,
    shellGroupElementRef,
    sidebarCollapsed: state.sidebarCollapsed || immersiveZenMode,
    rightSidebarCollapsed: state.rightSidebarCollapsed || immersiveZenMode,
    terminalOpen: effectiveTerminalOpen,
  })
  const handleMenuAction = useAppMenuAction({
    stateRef,
    openSettings,
  })

  const handleOpenFile = useCallback(
    (path: string) => {
      stateOpenFile(path)
    },
    [stateOpenFile],
  )

  const handleOpenFileView = useCallback(
    (path: string, view: FileViewKind) => {
      stateOpenFileView(path, view)
    },
    [stateOpenFileView],
  )

  const closeTerminalArea = useCallback(() => {
    if (!terminalPanelToggleGuard()) return
    setTerminalOpen(false)
  }, [terminalPanelToggleGuard])

  const toggleTerminalArea = useCallback(() => {
    if (!terminalPanelToggleGuard()) return
    setTerminalOpen((open) => {
      if (!open) setTerminalInitialized(true)
      return !open
    })
  }, [terminalPanelToggleGuard])

  const openTerminalArea = useCallback(() => {
    if (!terminalPanelToggleGuard()) return
    setTerminalInitialized(true)
    setTerminalOpen(true)
  }, [terminalPanelToggleGuard])

  const handleCreateFile = useCallback(() => {
    if (state.rootKind === 'single') {
      toast.info('New files are unavailable for single-file workspaces.')
      return
    }
    const nextPath = createUntitledPath(state.files)
    void stateCreateFile(nextPath)
      .then(() => {
        toast.success('Created file')
        stateOpenFile(nextPath)
      })
      .catch((error) => {
        toast.error('Failed to create file', {
          description: getErrorMessage(error),
        })
      })
  }, [state.files, state.rootKind, stateCreateFile, stateOpenFile])

  const handleCreateFolder = useCallback(() => {
    if (state.rootKind === 'single') {
      toast.info('New folders are unavailable for single-file workspaces.')
      return
    }
    const nextPath = window.prompt('New folder name', 'folder')?.trim()
    if (!nextPath) return
    void stateCreateFolder(nextPath)
      .then(() => {
        toast.success('Created folder')
      })
      .catch((error) => {
        toast.error('Failed to create folder', {
          description: getErrorMessage(error),
        })
      })
  }, [state.rootKind, stateCreateFolder])

  const handleRebuildSearchIndex = useCallback(() => {
    if (searchIndexRebuilding || !isDesktopRuntime()) return
    const toastId = 'search-index-rebuild'
    toast.loading('Rebuilding search index…', {
      id: toastId,
    })
    setSearchIndexRebuilding(true)
    const rebuildPromise = (async () => {
      await fsApi.rebuildSearchIndex()
      await queryClient.invalidateQueries({ queryKey: ['workspace-index'] })
      await queryClient.invalidateQueries({ queryKey: ['command-workspace-search'] })
    })()
    void rebuildPromise
      .then(() => {
        toast.success('Search index rebuilt', {
          id: toastId,
        })
      })
      .catch((error) => {
        toast.error('Failed to rebuild search index', {
          id: toastId,
          description: getErrorMessage(error),
        })
      })
      .finally(() => {
        setSearchIndexRebuilding(false)
      })
  }, [queryClient, searchIndexRebuilding])

  const handleOpenGitDiff = useCallback(
    (request: GitDiffRequest) => {
      stateOpenGitDiff(request.path, request.section)
    },
    [stateOpenGitDiff],
  )

  const handleOpenSearchResult = useCallback(
    (result: FsSearchResult) => {
      stateOpenFileView(result.path, 'source')
      window.setTimeout(() => {
        requestFocusSourcePosition({
          path: result.path,
          line: result.line,
          column: result.column,
          endColumn: result.end_column,
        })
      }, 80)
    },
    [stateOpenFileView],
  )

  const totalFiles = useMemo(
    () => state.files.reduce((count, file) => count + (file.kind === 'file' ? 1 : 0), 0),
    [state.files],
  )

  // memoize the context object so that consumers (routes) don't re-render
  // on every layout update; only when the referenced values actually change.
  const outletContext = useMemo(() => {
    return {
      activePath: state.activePath,
      editorValue: state.editorValue,
      graph: state.graph,
      graphLoading: state.graphLoading,
      onEditorChange: state.onEditorChange,
      onOpenFile: handleOpenFile,
      onOpenFileView: handleOpenFileView,
      theme: state.theme,
      setTheme: state.setTheme,
      files: state.files,
      fileContents: state.fileContents,
      workspaceIndex: state.workspaceIndex,
      saveStates: state.saveStates,
      loadingPaths: state.loadingPaths,
      currentView: state.viewMode,
      activeTab: state.activeTab,
      rootPath: state.rootPath,
      recentProjects: state.recentProjects,
      showEditorStatusBar: state.showEditorStatusBar && !immersiveZenMode,
      graphMiniMapEnabled: state.graphMiniMapEnabled,
      graphContentMode: state.graphContentMode,
      onCloseActiveTab: state.onCloseActiveTab,
      onOpenProject: state.onOpenProject,
    } as LayoutContext
  }, [
    state.activePath,
    state.editorValue,
    state.graph,
    state.graphLoading,
    state.onEditorChange,
    handleOpenFile,
    handleOpenFileView,
    state.theme,
    state.setTheme,
    state.files,
    state.fileContents,
    state.workspaceIndex,
    state.saveStates,
    state.loadingPaths,
    state.viewMode,
    state.activeTab,
    state.rootPath,
    state.recentProjects,
    state.showEditorStatusBar,
    immersiveZenMode,
    state.graphMiniMapEnabled,
    state.graphContentMode,
    state.onCloseActiveTab,
    state.onOpenProject,
  ])
  const outlet = useOutlet(outletContext)
  const routeCacheKey = useMemo(
    () => `${state.rootKind}:${state.rootPath}:${location.pathname}`,
    [location.pathname, state.rootKind, state.rootPath],
  )
  const routeCacheMax = useMemo(
    () => Math.min(24, Math.max(8, state.tabs.length + 2)),
    [state.tabs.length],
  )

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = state.theme
    document.documentElement.dataset.motionSmoothScrolling = motionSmoothScrolling
      ? 'true'
      : 'false'
    document.documentElement.dataset.motionCursor = motionAnimatedCursor ? 'true' : 'false'
    document.documentElement.dataset.motionPanels = motionAnimatedPanels ? 'true' : 'false'
    document.documentElement.dataset.customTheme = customThemeId ? 'true' : 'false'
    document.documentElement.dataset.immersiveZen = immersiveZenMode ? 'true' : 'false'
    document.documentElement.dataset.immersiveFocus = immersiveFocusMode ? 'true' : 'false'
    document.documentElement.dataset.immersiveTypewriter = immersiveTypewriterMode
      ? 'true'
      : 'false'
  }, [
    customThemeId,
    immersiveFocusMode,
    immersiveTypewriterMode,
    immersiveZenMode,
    motionAnimatedCursor,
    motionAnimatedPanels,
    motionSmoothScrolling,
    state.theme,
  ])

  const openHeading = useCallback(
    (path: string, slug: string) => {
      handleOpenFileView(path, 'edit')
      setPendingHeading({ path, slug })
    },
    [handleOpenFileView],
  )

  useEffect(() => {
    if (!pendingHeading) return
    if (state.activePath !== pendingHeading.path || state.viewMode !== 'wysiwyg') return

    const timer = window.setTimeout(() => {
      requestFocusHeading(pendingHeading)
      setPendingHeading((current) =>
        current?.path === pendingHeading.path && current.slug === pendingHeading.slug
          ? null
          : current,
      )
    }, 80)

    return () => window.clearTimeout(timer)
  }, [pendingHeading, state.activePath, state.viewMode])

  useEffect(() => {
    if (!isDesktopRuntime()) return
    const flushOnClose = () => {
      void fsApi.flushBuffers()
    }
    window.addEventListener('beforeunload', flushOnClose)
    return () => {
      window.removeEventListener('beforeunload', flushOnClose)
    }
  }, [])

  useKeyboardShortcuts({
    activeTabId: state.activeTabId,
    shortcutOverrides: state.shortcutOverrides,
    tabs: state.tabs,
    viewMode: state.viewMode,
    onCloseActiveTab: state.onCloseActiveTab,
    onCreateFile: () => handleMenuAction('file.new'),
    onOpenCommandPalette: () => setCommandOpen(true),
    onOpenFile: () => handleMenuAction('file.open_file'),
    onOpenProject: () => handleMenuAction('file.open_project'),
    onOpenSettings: openSettings,
    onOpenTab: state.onOpenTab,
    onSetViewMode: state.setViewMode,
    onToggleRightSidebar: state.toggleRightSidebar,
    onToggleSidebar: state.toggleSidebar,
  })

  useEffect(() => {
    const domHandler = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail
      if (typeof detail === 'string') handleMenuAction(detail)
    }

    window.addEventListener('marklab:menu-action', domHandler)
    const unsubscribeRendererMenuAction = onMenuActionRequest(handleMenuAction)

    let unlisten: (() => void) | undefined
    if (isDesktopRuntime()) {
      void listen<string>('menu-action', (event) => {
        handleMenuAction(event.payload)
      }).then((fn) => {
        unlisten = fn
      })
    }

    return () => {
      unsubscribeRendererMenuAction()
      window.removeEventListener('marklab:menu-action', domHandler)
      if (unlisten) unlisten()
    }
  }, [handleMenuAction])

  const workspacePanels = (
    <AppWorkspacePanels
      state={state}
      workspacePanelLayout={workspacePanelLayout}
      workspaceGroupElementRef={workspaceGroupElementRef}
      leftSidebarPanelRef={leftSidebarPanelRef}
      rightSidebarPanelRef={rightSidebarPanelRef}
      outlet={outlet}
      routeCacheKey={routeCacheKey}
      routeCacheMax={routeCacheMax}
      totalFiles={totalFiles}
      onOpenFile={handleOpenFile}
      onOpenFileView={handleOpenFileView}
      onOpenGitDiff={handleOpenGitDiff}
      onOpenSearchResult={handleOpenSearchResult}
      immersiveZenMode={immersiveZenMode}
    />
  )

  return (
    <div className="app-shell flex h-full flex-col">
      <ExportStatusOverlay />
      <Titlebar
        activePath={state.activePath}
        activeTab={state.activeTab}
        dirtyPaths={state.dirtyPaths}
        saveStates={state.saveStates}
        silentSave={state.silentSave}
        onToggleSidebar={state.toggleSidebar}
        onToggleRightSidebar={state.toggleRightSidebar}
        onSelectProject={state.onSelectProject}
        onSelectSingleFile={state.onSelectSingleFile}
        onCreateFile={handleCreateFile}
        onCreateFolder={handleCreateFolder}
        onOpenFile={handleOpenFile}
        onOpenHeading={openHeading}
        onOpenSearchResult={handleOpenSearchResult}
        onOpenWorkspaceGraph={state.onOpenWorkspaceGraph}
        onCloseActiveTab={state.onCloseActiveTab}
        onOpenTerminal={openTerminalArea}
        onRebuildSearchIndex={handleRebuildSearchIndex}
        onChangeView={state.setViewMode}
        files={state.files}
        workspaceIndex={state.workspaceIndex}
        canCreateWorkspaceEntries={state.rootKind !== 'single'}
        searchIndexRebuilding={searchIndexRebuilding}
        isMaximized={state.isMaximized}
        setIsMaximized={state.setIsMaximized}
        theme={state.theme}
        setTheme={state.setTheme}
        commandOpen={commandOpen}
        onCommandOpenChange={setCommandOpen}
        onOpenSettings={openSettings}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <AppShellPanels
        shellPanelLayout={shellPanelLayout}
        shellGroupElementRef={shellGroupElementRef}
        terminalPanelRef={terminalPanelRef}
        workspacePanels={workspacePanels}
        terminalOpen={effectiveTerminalOpen}
        terminalInitialized={terminalInitialized}
        theme={state.theme}
        onCloseTerminalArea={closeTerminalArea}
      />
      {!immersiveZenMode && (
        <AppStatusBar
          rootKind={state.rootKind}
          rootPath={state.rootPath}
          files={state.files}
          tabs={state.tabs}
          activeTab={state.activeTab}
          activePath={state.activePath}
          viewMode={state.viewMode}
          dirtyPaths={state.dirtyPaths}
          saveStates={state.saveStates}
          terminalOpen={terminalOpen}
          onToggleTerminal={toggleTerminalArea}
          onRestoreSession={state.restoreSession}
          restoreStatusMessage={state.restoreStatusMessage}
          restoreStatusBusy={state.isRestoringSession}
        />
      )}
    </div>
  )
}

export default AppLayout
