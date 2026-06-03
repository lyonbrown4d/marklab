import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Locale } from '@/i18n/resources'
import { getInitialLocale } from '@/i18n/utils'
import { createElectronSettingsJsonStorage } from '@/store/persistStorage'
import {
  areWorkspaceTabsEqual,
  fileViewTabId,
  normalizeWorkspaceTabId,
  normalizeWorkspaceTabs,
} from '@/logic/tabs'
import {
  normalizeShortcutList,
  sanitizeShortcutOverrides,
  type ShortcutActionId,
  type ShortcutBindings,
} from '@/logic/shortcuts'

export type ViewMode = 'wysiwyg' | 'source' | 'graph'
export type FileViewKind = 'edit' | 'source' | 'graph'
export type ThemeMode = 'light' | 'dark' | 'marko-light' | 'marko-dark'
export type GitDiffSection = 'staged' | 'unstaged' | 'untracked' | 'conflicts'
export type GraphContentMode = 'none' | 'summary' | 'full'
export type MarkdownAssetImportStrategy = 'copy-to-document-assets' | 'preserve-path'

export type WorkspaceTab =
  | {
      kind: 'file'
      view: FileViewKind
      path: string
    }
  | {
      kind: 'workspace-graph'
    }
  | {
      kind: 'git-diff'
      path: string
      section: GitDiffSection
    }

export type FileEntry = {
  path: string
  kind: 'file' | 'folder'
}

type AppState = {
  rootPath: string
  rootKind: 'internal' | 'external' | 'single'
  recentProjects: string[]
  entries: FileEntry[]
  tabs: WorkspaceTab[]
  activeTabId: string | null
  hasHydrated: boolean
  viewMode: ViewMode
  theme: ThemeMode
  locale: Locale
  sidebarCollapsed: boolean
  rightSidebarCollapsed: boolean
  silentSave: boolean
  showEditorStatusBar: boolean
  defaultFileView: FileViewKind
  graphMiniMapEnabled: boolean
  graphContentMode: GraphContentMode
  markdownAssetImportStrategy: MarkdownAssetImportStrategy
  shortcutOverrides: ShortcutBindings
  setRootPath: (path: string) => void
  setRootKind: (kind: 'internal' | 'external' | 'single') => void
  setEntries: (entries: FileEntry[]) => void
  setTabs: (tabs: WorkspaceTab[]) => void
  setActiveTabId: (id: string | null) => void
  setHasHydrated: (hydrated: boolean) => void
  setViewMode: (mode: ViewMode) => void
  setTheme: (theme: ThemeMode) => void
  setLocale: (locale: Locale) => void
  setSilentSave: (silent: boolean) => void
  setShowEditorStatusBar: (show: boolean) => void
  setDefaultFileView: (view: FileViewKind) => void
  setGraphMiniMapEnabled: (enabled: boolean) => void
  setGraphContentMode: (mode: GraphContentMode) => void
  setMarkdownAssetImportStrategy: (strategy: MarkdownAssetImportStrategy) => void
  setShortcutOverride: (action: ShortcutActionId, bindings: string[] | null) => void
  resetShortcutOverrides: () => void
  toggleSidebar: () => void
  toggleRightSidebar: () => void
  touchRecentProject: (path: string) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      rootPath: '',
      rootKind: 'internal',
      recentProjects: [],
      entries: [],
      tabs: [],
      activeTabId: null,
      hasHydrated: false,
      viewMode: 'wysiwyg',
      theme: 'marko-light',
      locale: getInitialLocale(),
      sidebarCollapsed: false,
      rightSidebarCollapsed: false,
      silentSave: true,
      showEditorStatusBar: true,
      defaultFileView: 'edit',
      graphMiniMapEnabled: true,
      graphContentMode: 'summary',
      markdownAssetImportStrategy: 'copy-to-document-assets',
      shortcutOverrides: {},
      setRootPath: (path) => set((state) => (state.rootPath === path ? state : { rootPath: path })),
      setRootKind: (kind) => set((state) => (state.rootKind === kind ? state : { rootKind: kind })),
      setEntries: (entries) => set((state) => (state.entries === entries ? state : { entries })),
      setTabs: (tabs) =>
        set((state) => {
          const normalizedTabs = normalizeWorkspaceTabs(tabs)
          const activeTabId = normalizeWorkspaceTabId(state.activeTabId, normalizedTabs)
          return areWorkspaceTabsEqual(state.tabs, normalizedTabs) &&
            state.activeTabId === activeTabId
            ? state
            : { tabs: normalizedTabs, activeTabId }
        }),
      setActiveTabId: (activeTabId) =>
        set((state) => (state.activeTabId === activeTabId ? state : { activeTabId })),
      setHasHydrated: (hasHydrated) =>
        set((state) => (state.hasHydrated === hasHydrated ? state : { hasHydrated })),
      setViewMode: (mode) => set((state) => (state.viewMode === mode ? state : { viewMode: mode })),
      setTheme: (theme) => set((state) => (state.theme === theme ? state : { theme })),
      setLocale: (locale) => set((state) => (state.locale === locale ? state : { locale })),
      setSilentSave: (silentSave) =>
        set((state) => (state.silentSave === silentSave ? state : { silentSave })),
      setShowEditorStatusBar: (showEditorStatusBar) =>
        set((state) =>
          state.showEditorStatusBar === showEditorStatusBar ? state : { showEditorStatusBar },
        ),
      setDefaultFileView: (defaultFileView) =>
        set((state) => (state.defaultFileView === defaultFileView ? state : { defaultFileView })),
      setGraphMiniMapEnabled: (graphMiniMapEnabled) =>
        set((state) =>
          state.graphMiniMapEnabled === graphMiniMapEnabled ? state : { graphMiniMapEnabled },
        ),
      setGraphContentMode: (graphContentMode) =>
        set((state) =>
          state.graphContentMode === graphContentMode ? state : { graphContentMode },
        ),
      setMarkdownAssetImportStrategy: (markdownAssetImportStrategy) =>
        set((state) =>
          state.markdownAssetImportStrategy === markdownAssetImportStrategy
            ? state
            : { markdownAssetImportStrategy },
        ),
      setShortcutOverride: (action, bindings) =>
        set((state) => {
          const next = { ...state.shortcutOverrides }
          if (bindings === null) {
            delete next[action]
          } else {
            next[action] = normalizeShortcutList(bindings)
          }
          return { shortcutOverrides: next }
        }),
      resetShortcutOverrides: () => set({ shortcutOverrides: {} }),
      toggleSidebar: () =>
        set((state) => ({
          sidebarCollapsed: !state.sidebarCollapsed,
        })),
      toggleRightSidebar: () =>
        set((state) => ({
          rightSidebarCollapsed: !state.rightSidebarCollapsed,
        })),
      touchRecentProject: (path) =>
        set((state) => {
          const next = [path, ...state.recentProjects.filter((p) => p !== path)]
          return { recentProjects: next.slice(0, 8) }
        }),
    }),
    {
      name: 'marko.app',
      storage: createElectronSettingsJsonStorage('marko.app'),
      version: 11,
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
      migrate: (persistedState, version) => {
        const state = (persistedState ?? {}) as Partial<AppState> & { theme?: string }
        const legacyTheme =
          version < 6 && state.theme === 'light'
            ? 'marko-light'
            : version < 6 && state.theme === 'dark'
              ? 'marko-dark'
              : state.theme
        const normalizedTheme: ThemeMode =
          legacyTheme === 'light' ||
          legacyTheme === 'dark' ||
          legacyTheme === 'marko-light' ||
          legacyTheme === 'marko-dark'
            ? (legacyTheme as ThemeMode)
            : 'marko-light'
        const normalizedViewMode: ViewMode =
          state.viewMode === 'graph' || state.viewMode === 'source' ? state.viewMode : 'wysiwyg'
        const normalizedTabs = normalizeWorkspaceTabs(state.tabs)
        const legacyActivePath =
          typeof (state as { activePath?: unknown }).activePath === 'string'
            ? ((state as { activePath?: string }).activePath ?? null)
            : null
        const persistedActiveTabId =
          typeof state.activeTabId === 'string'
            ? state.activeTabId
            : legacyActivePath
              ? fileViewTabId(legacyActivePath, 'edit')
              : null
        const normalizedActiveTabId = normalizeWorkspaceTabId(persistedActiveTabId, normalizedTabs)
        return {
          ...state,
          tabs: normalizedTabs,
          activeTabId: normalizedActiveTabId,
          theme: normalizedTheme,
          viewMode: normalizedViewMode,
          rightSidebarCollapsed: state.rightSidebarCollapsed ?? false,
          silentSave: state.silentSave ?? true,
          showEditorStatusBar: state.showEditorStatusBar ?? true,
          defaultFileView:
            state.defaultFileView === 'source' || state.defaultFileView === 'graph'
              ? state.defaultFileView
              : 'edit',
          graphMiniMapEnabled: state.graphMiniMapEnabled ?? true,
          graphContentMode:
            state.graphContentMode === 'none' || state.graphContentMode === 'full'
              ? state.graphContentMode
              : 'summary',
          markdownAssetImportStrategy:
            state.markdownAssetImportStrategy === 'preserve-path'
              ? 'preserve-path'
              : 'copy-to-document-assets',
          shortcutOverrides: sanitizeShortcutOverrides(
            version < 10
              ? (state as { shortcutOverrides?: unknown }).shortcutOverrides
              : state.shortcutOverrides,
          ),
        } as AppState
      },
      partialize: (state) => ({
        rootPath: state.rootPath,
        rootKind: state.rootKind,
        recentProjects: state.recentProjects,
        tabs: state.tabs,
        activeTabId: state.activeTabId,
        viewMode: state.viewMode,
        theme: state.theme,
        locale: state.locale,
        sidebarCollapsed: state.sidebarCollapsed,
        rightSidebarCollapsed: state.rightSidebarCollapsed,
        silentSave: state.silentSave,
        showEditorStatusBar: state.showEditorStatusBar,
        defaultFileView: state.defaultFileView,
        graphMiniMapEnabled: state.graphMiniMapEnabled,
        graphContentMode: state.graphContentMode,
        markdownAssetImportStrategy: state.markdownAssetImportStrategy,
        shortcutOverrides: state.shortcutOverrides,
      }),
    },
  ),
)
