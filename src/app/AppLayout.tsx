import { useLocation, useOutlet } from 'react-router-dom'
import {
  Group as ResizableGroup,
  Panel as ResizablePanel,
  Separator as ResizableSeparator,
  useDefaultLayout,
  usePanelRef,
} from 'react-resizable-panels'
import { KeepAlive } from 'keepalive-for-react'
import Sidebar from '@/components/Sidebar'
import RightSidebar from '@/components/RightSidebar'
import Titlebar from '@/components/Titlebar'
import TabsBar from '@/components/TabsBar'
import AppStatusBar from '@/components/AppStatusBar'
import ExportStatusOverlay from '@/components/ExportStatusOverlay'
import TerminalPanel from '@/components/TerminalPanel'
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
import { exportApi } from '@/services/exportApi'
import { fsApi, type FsWorkspaceIndex } from '@/services/fsApi'
import { requestExportContent } from '@/utils/exportContent'
import { isTauriRuntime } from '@/utils/tauri'
import type { SaveState } from '@/app/useEditorBuffer'
import {
  requestFocusHeading,
  requestFocusSourcePosition,
  type FocusHeadingRequest,
} from '@/utils/editorNavigation'
import { useLatest } from 'ahooks'
import { useTauriReadySignal } from '@/app/useTauriReadySignal'
import type { GitDiffRequest } from '@/services/gitApi'
import { getWorkspaceTabId } from '@/logic/tabs'
import type { FsSearchResult } from '@/services/fsApi'
import { useKeyboardShortcuts } from '@/app/useKeyboardShortcuts'
import { cn } from '@/lib/utils'

const PANEL_LAYOUT_ANIMATION_MS = 220
const panelLayoutAnimationTimers = new WeakMap<HTMLElement, number>()

function animatePanelLayoutChange(element: HTMLElement | null, updateLayout: () => void) {
  if (!element) {
    updateLayout()
    return
  }

  const activeTimer = panelLayoutAnimationTimers.get(element)
  if (activeTimer !== undefined) window.clearTimeout(activeTimer)

  element.classList.add('is-panel-layout-animating')
  void element.offsetWidth
  updateLayout()

  const timer = window.setTimeout(() => {
    element.classList.remove('is-panel-layout-animating')
    panelLayoutAnimationTimers.delete(element)
  }, PANEL_LAYOUT_ANIMATION_MS + 60)
  panelLayoutAnimationTimers.set(element, timer)
}

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

export default function AppLayout() {
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
  const leftSidebarCollapsedRef = useRef(state.sidebarCollapsed)
  const rightSidebarCollapsedRef = useRef(state.rightSidebarCollapsed)
  const terminalOpenRef = useRef(terminalOpen)
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
  useTauriReadySignal()

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
    if (!isTauriRuntime()) return
    const flushOnClose = () => {
      void fsApi.flushBuffers()
    }
    window.addEventListener('beforeunload', flushOnClose)
    return () => {
      window.removeEventListener('beforeunload', flushOnClose)
    }
  }, [])

  useEffect(() => {
    const panel = leftSidebarPanelRef.current
    if (!panel) return

    const shouldAnimate = leftSidebarCollapsedRef.current !== state.sidebarCollapsed
    leftSidebarCollapsedRef.current = state.sidebarCollapsed
    const updateLayout = () => {
      if (state.sidebarCollapsed) {
        panel.collapse()
        return
      }
      if (panel.isCollapsed()) panel.expand()
    }

    if (shouldAnimate) {
      animatePanelLayoutChange(workspaceGroupElementRef.current, updateLayout)
      return
    }
    updateLayout()
  }, [leftSidebarPanelRef, state.sidebarCollapsed])

  useEffect(() => {
    const panel = rightSidebarPanelRef.current
    if (!panel) return

    const shouldAnimate = rightSidebarCollapsedRef.current !== state.rightSidebarCollapsed
    rightSidebarCollapsedRef.current = state.rightSidebarCollapsed
    const updateLayout = () => {
      if (state.rightSidebarCollapsed) {
        panel.collapse()
        return
      }
      if (panel.isCollapsed()) panel.expand()
    }

    if (shouldAnimate) {
      animatePanelLayoutChange(workspaceGroupElementRef.current, updateLayout)
      return
    }
    updateLayout()
  }, [rightSidebarPanelRef, state.rightSidebarCollapsed])

  useLayoutEffect(() => {
    const panel = terminalPanelRef.current
    if (!panel) return

    const shouldAnimate = terminalOpenRef.current !== terminalOpen
    terminalOpenRef.current = terminalOpen
    const updateLayout = () => {
      if (!terminalOpen) {
        panel.collapse()
        return
      }

      if (panel.isCollapsed()) panel.expand()
      if (panel.getSize().inPixels < 120) panel.resize('280px')
    }

    if (shouldAnimate) {
      animatePanelLayoutChange(shellGroupElementRef.current, updateLayout)
      return
    }
    updateLayout()
  }, [terminalOpen, terminalPanelRef])

  const handleMenuAction = useCallback(
    (id: string) => {
      const currentState = stateRef.current

      const executeEdit = (action: string) => {
        if (typeof document === 'undefined') return
        if (action === 'edit.undo') document.execCommand('undo')
        if (action === 'edit.redo') document.execCommand('redo')
        if (action === 'edit.cut') document.execCommand('cut')
        if (action === 'edit.copy') document.execCommand('copy')
        if (action === 'edit.paste') document.execCommand('paste')
        if (action === 'edit.select_all') document.execCommand('selectAll')
      }

      const createUntitledPath = () => {
        const files = new Set(
          currentState.files
            .filter((entry) => entry.kind === 'file')
            .map((entry) => entry.path.toLowerCase()),
        )
        if (!files.has('untitled.md')) return 'Untitled.md'
        for (let index = 1; index <= 999; index += 1) {
          const next = `Untitled-${index}.md`
          if (!files.has(next.toLowerCase())) return next
        }
        return `Untitled-${Date.now()}.md`
      }

      if (id.startsWith('edit.')) {
        executeEdit(id)
        return
      }
      if (id === 'file.open_project') {
        void currentState.onSelectProject()
        return
      }
      if (id === 'file.open_file') {
        void currentState.onSelectSingleFile()
        return
      }
      if (id === 'file.new') {
        const next = createUntitledPath()
        void currentState.createFile(next).then(() => currentState.onOpenFile(next))
        return
      }
      if (id === 'file.export_pdf' || id === 'file.export_docx' || id === 'file.export_html') {
        if (!isTauriRuntime()) return
        const format =
          id === 'file.export_pdf' ? 'pdf' : id === 'file.export_docx' ? 'docx' : 'html'
        const { activePath, rootPath, editorValue } = currentState
        void (async () => {
          const content = await requestExportContent(editorValue, {
            expectedActivePath: activePath,
          })
          await exportApi.exportMarkdown(content, format, {
            rootPath,
            activePath,
          })
        })().catch((err) => window.alert(String(err)))
        return
      }
      if (id === 'view.wysiwyg') currentState.setViewMode('wysiwyg')
      if (id === 'view.source') currentState.setViewMode('source')
      if (id === 'view.graph') currentState.setViewMode('graph')
      if (id === 'view.toggle_sidebar') currentState.toggleSidebar()
      if (id === 'view.toggle_right_sidebar') currentState.toggleRightSidebar()
      if (id === 'settings.open') setSettingsOpen(true)
      if (id === 'theme.light') currentState.setTheme('light')
      if (id === 'theme.dark') currentState.setTheme('dark')
      if (id === 'theme.marko-light') currentState.setTheme('marko-light')
      if (id === 'theme.marko-dark') currentState.setTheme('marko-dark')
      if (id === 'help.about') {
        window.alert('marko\nA desktop Markdown workspace with graph navigation.')
      }
    },
    [stateRef],
  )

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
    if (isTauriRuntime()) {
      void import('@tauri-apps/api/event').then(({ listen }) => {
        void listen<string>('menu-action', (event) => {
          handleMenuAction(event.payload)
        }).then((fn) => {
          unlisten = fn
        })
      })
    }

    return () => {
      window.removeEventListener('marko:menu-action', domHandler)
      if (unlisten) unlisten()
    }
  }, [handleMenuAction])

  const workspacePanels = (
    <ResizableGroup
      className="min-h-0 flex-1"
      defaultLayout={workspacePanelLayout.defaultLayout}
      elementRef={workspaceGroupElementRef}
      id="marko-workspace-panels"
      onLayoutChanged={workspacePanelLayout.onLayoutChanged}
      orientation="horizontal"
      resizeTargetMinimumSize={{ coarse: 28, fine: 8 }}
    >
      <ResizablePanel
        className="min-h-0"
        collapsedSize="48px"
        collapsible
        defaultSize="320px"
        disabled={state.sidebarCollapsed}
        groupResizeBehavior="preserve-pixel-size"
        id="left-sidebar"
        maxSize="520px"
        minSize="240px"
        panelRef={leftSidebarPanelRef}
      >
        <Sidebar
          collapsed={state.sidebarCollapsed}
          recentProjects={state.recentProjects}
          files={state.files}
          fileTree={state.fileTree}
          activePath={state.activeResourcePath}
          onOpenFile={handleOpenFile}
          onOpenFileView={handleOpenFileView}
          onOpenProject={state.onOpenProject}
          onOpenWorkspaceGraph={state.onOpenWorkspaceGraph}
          onCreateFile={state.createFile}
          onCreateFolder={state.createFolder}
          onRenamePath={state.renamePath}
          onMovePath={state.movePath}
          onDeletePath={state.deletePath}
          onUseInternalRoot={state.onUseInternalRoot}
          rootKind={state.rootKind}
          rootPath={state.rootPath}
          onOpenGitDiff={handleOpenGitDiff}
          onInspectPath={state.onInspectPath}
          onOpenSearchResult={handleOpenSearchResult}
        />
      </ResizablePanel>
      <ResizableSeparator
        className="resize-handle resize-handle-vertical"
        disabled={state.sidebarCollapsed}
        id="left-sidebar-resize"
      />
      <ResizablePanel className="min-h-0" id="workspace-main" minSize="360px">
        <section className="workspace-main flex h-full min-w-0 flex-1 flex-col overflow-hidden border-x border-border/80">
          <TabsBar
            tabs={state.tabs}
            dirtyPaths={state.dirtyPaths}
            saveStates={state.saveStates}
            activeTabId={state.activeTabId}
            onOpenTab={state.onOpenTab}
            onCloseTab={state.onCloseTab}
            viewMode={state.viewMode}
            onChangeView={state.setViewMode}
            silentSave={state.silentSave}
          />
          <div className="min-h-0 flex-1 overflow-hidden">
            <KeepAlive
              activeCacheKey={routeCacheKey}
              cacheNodeClassName="h-full"
              containerClassName="h-full"
              max={routeCacheMax}
            >
              {outlet}
            </KeepAlive>
          </div>
        </section>
      </ResizablePanel>
      <ResizableSeparator
        className="resize-handle resize-handle-vertical"
        disabled={state.rightSidebarCollapsed}
        id="right-sidebar-resize"
      />
      <ResizablePanel
        className="min-h-0"
        collapsedSize="56px"
        collapsible
        defaultSize="288px"
        disabled={state.rightSidebarCollapsed}
        groupResizeBehavior="preserve-pixel-size"
        id="right-sidebar"
        maxSize="460px"
        minSize="240px"
        panelRef={rightSidebarPanelRef}
      >
        <RightSidebar
          collapsed={state.rightSidebarCollapsed}
          activePath={state.activePath}
          editorValue={state.editorValue}
          files={state.files}
          fileContents={state.fileContents}
          dirtyPaths={state.dirtyPaths}
          workspaceIndex={state.workspaceIndex}
          tabs={state.tabs.map(getWorkspaceTabId)}
          totalFiles={totalFiles}
          onOpenFileView={handleOpenFileView}
          viewMode={state.viewMode}
          inspectedPath={state.inspectedPath}
        />
      </ResizablePanel>
    </ResizableGroup>
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
      <ResizableGroup
        className="min-h-0 flex-1"
        defaultLayout={shellPanelLayout.defaultLayout}
        elementRef={shellGroupElementRef}
        id="marko-shell-panels"
        onLayoutChanged={shellPanelLayout.onLayoutChanged}
        orientation="vertical"
        resizeTargetMinimumSize={{ coarse: 28, fine: 8 }}
      >
        <ResizablePanel className="min-h-0" id="workspace-area" minSize="260px">
          {workspacePanels}
        </ResizablePanel>
        <ResizableSeparator
          className={cn(
            'resize-handle resize-handle-horizontal',
            !terminalOpen && 'pointer-events-none opacity-0',
          )}
          disabled={!terminalOpen}
          id="terminal-resize"
        />
        <ResizablePanel
          className="min-h-0"
          collapsedSize="0px"
          collapsible
          defaultSize="280px"
          groupResizeBehavior="preserve-pixel-size"
          id="terminal"
          maxSize="65vh"
          minSize="160px"
          panelRef={terminalPanelRef}
        >
          {terminalInitialized && (
            <TerminalPanel onClose={closeTerminalArea} theme={state.theme} visible={terminalOpen} />
          )}
        </ResizablePanel>
      </ResizableGroup>
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
