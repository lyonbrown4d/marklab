import { useLocation, useOutlet } from 'react-router-dom'
import { useDefaultLayout, usePanelRef } from 'react-resizable-panels'
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
} from '@/store/useAppStore'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { fsApi, type FsWorkspaceIndex } from '@/services/fsApi'
import { listen } from '@/runtime/events'
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
  showEditorStatusBar: boolean
  graphMiniMapEnabled: boolean
  graphContentMode: GraphContentMode
  onCloseActiveTab: () => void
}

const AppLayout = () => {
  const state = useAppLayoutState()
  const stateRef = useLatest(state)
  const location = useLocation()
  const stateOpenFile = state.onOpenFile
  const stateOpenFileView = state.onOpenFileView
  const stateOpenGitDiff = state.onOpenGitDiff
  const [pendingHeading, setPendingHeading] = useState<FocusHeadingRequest | null>(null)
  const [commandOpen, setCommandOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [terminalInitialized, setTerminalInitialized] = useState(false)
  const workspaceGroupElementRef = useRef<HTMLDivElement | null>(null)
  const shellGroupElementRef = useRef<HTMLDivElement | null>(null)
  const leftSidebarPanelRef = usePanelRef()
  const rightSidebarPanelRef = usePanelRef()
  const terminalPanelRef = usePanelRef()
  const workspacePanelLayout = useDefaultLayout({
    id: 'marko-workspace-panels',
    panelIds: ['left-sidebar', 'workspace-main', 'right-sidebar'],
  })
  const shellPanelLayout = useDefaultLayout({
    id: 'marko-shell-panels',
    panelIds: ['workspace-area', 'terminal'],
  })
  useDesktopReadySignal()
  useAppPanelLayoutSync({
    leftSidebarPanelRef,
    rightSidebarPanelRef,
    terminalPanelRef,
    workspaceGroupElementRef,
    shellGroupElementRef,
    sidebarCollapsed: state.sidebarCollapsed,
    rightSidebarCollapsed: state.rightSidebarCollapsed,
    terminalOpen,
  })
  const handleMenuAction = useAppMenuAction({
    stateRef,
    setSettingsOpen,
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
    setTerminalOpen(false)
  }, [])

  const toggleTerminalArea = useCallback(() => {
    if (!terminalOpen) setTerminalInitialized(true)
    setTerminalOpen(!terminalOpen)
  }, [terminalOpen])

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
      showEditorStatusBar: state.showEditorStatusBar,
      graphMiniMapEnabled: state.graphMiniMapEnabled,
      graphContentMode: state.graphContentMode,
      onCloseActiveTab: state.onCloseActiveTab,
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
    state.showEditorStatusBar,
    state.graphMiniMapEnabled,
    state.graphContentMode,
    state.onCloseActiveTab,
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
  }, [state.theme])

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
    onOpenSettings: () => setSettingsOpen(true),
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

    window.addEventListener('marko:menu-action', domHandler)

    let unlisten: (() => void) | undefined
    if (isDesktopRuntime()) {
      void listen<string>('menu-action', (event) => {
        handleMenuAction(event.payload)
      }).then((fn) => {
        unlisten = fn
      })
    }

    return () => {
      window.removeEventListener('marko:menu-action', domHandler)
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
        onOpenFile={handleOpenFile}
        onOpenHeading={openHeading}
        onOpenSearchResult={handleOpenSearchResult}
        onChangeView={state.setViewMode}
        files={state.files}
        workspaceIndex={state.workspaceIndex}
        isMaximized={state.isMaximized}
        setIsMaximized={state.setIsMaximized}
        theme={state.theme}
        setTheme={state.setTheme}
        commandOpen={commandOpen}
        onCommandOpenChange={setCommandOpen}
        settingsOpen={settingsOpen}
        onSettingsOpenChange={setSettingsOpen}
      />
      <AppShellPanels
        shellPanelLayout={shellPanelLayout}
        shellGroupElementRef={shellGroupElementRef}
        terminalPanelRef={terminalPanelRef}
        workspacePanels={workspacePanels}
        terminalOpen={terminalOpen}
        terminalInitialized={terminalInitialized}
        theme={state.theme}
        onCloseTerminalArea={closeTerminalArea}
      />
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
      />
    </div>
  )
}

export default AppLayout
