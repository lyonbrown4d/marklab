import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Locale } from '@/i18n/resources'
import { getInitialLocale } from '@/i18n/utils'
import { createElectronSettingsJsonStorage } from '@/store/persistStorage'
import {
  areWorkspaceTabsEqual,
  normalizeWorkspaceTabId,
  normalizeWorkspaceTabs,
} from '@/logic/tabs'
import {
  normalizeShortcutList,
  type ShortcutActionId,
  type ShortcutBindings,
} from '@/logic/shortcuts'
import {
  APP_STORE_VERSION,
  migrateAppStoreState,
  partializeAppStoreState,
} from '@/store/appStorePersistence'

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

export type AppState = {
  rootPath: string
  rootKind: 'internal' | 'external' | 'single'
  recentProjects: string[]
  entries: FileEntry[]
  tabs: WorkspaceTab[]
  activeTabId: string | null
  hasHydrated: boolean
  viewMode: ViewMode
  theme: ThemeMode
  customThemeId: string | null
  locale: Locale
  sidebarCollapsed: boolean
  rightSidebarCollapsed: boolean
  silentSave: boolean
  showEditorStatusBar: boolean
  defaultFileView: FileViewKind
  graphMiniMapEnabled: boolean
  graphContentMode: GraphContentMode
  markdownAssetImportStrategy: MarkdownAssetImportStrategy
  motionSmoothScrolling: boolean
  motionAnimatedCursor: boolean
  motionAnimatedPanels: boolean
  immersiveZenMode: boolean
  immersiveFocusMode: boolean
  immersiveTypewriterMode: boolean
  shortcutOverrides: ShortcutBindings
  setRootPath: (path: string) => void
  setRootKind: (kind: 'internal' | 'external' | 'single') => void
  setEntries: (entries: FileEntry[]) => void
  setTabs: (tabs: WorkspaceTab[]) => void
  setActiveTabId: (id: string | null) => void
  setHasHydrated: (hydrated: boolean) => void
  setViewMode: (mode: ViewMode) => void
  setTheme: (theme: ThemeMode) => void
  setCustomThemeId: (themeId: string | null) => void
  setLocale: (locale: Locale) => void
  setSilentSave: (silent: boolean) => void
  setShowEditorStatusBar: (show: boolean) => void
  setDefaultFileView: (view: FileViewKind) => void
  setGraphMiniMapEnabled: (enabled: boolean) => void
  setGraphContentMode: (mode: GraphContentMode) => void
  setMarkdownAssetImportStrategy: (strategy: MarkdownAssetImportStrategy) => void
  setMotionSmoothScrolling: (enabled: boolean) => void
  setMotionAnimatedCursor: (enabled: boolean) => void
  setMotionAnimatedPanels: (enabled: boolean) => void
  setImmersiveZenMode: (enabled: boolean) => void
  setImmersiveFocusMode: (enabled: boolean) => void
  setImmersiveTypewriterMode: (enabled: boolean) => void
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
      customThemeId: null,
      locale: getInitialLocale(),
      sidebarCollapsed: false,
      rightSidebarCollapsed: false,
      silentSave: true,
      showEditorStatusBar: true,
      defaultFileView: 'edit',
      graphMiniMapEnabled: true,
      graphContentMode: 'summary',
      markdownAssetImportStrategy: 'copy-to-document-assets',
      motionSmoothScrolling: true,
      motionAnimatedCursor: true,
      motionAnimatedPanels: true,
      immersiveZenMode: false,
      immersiveFocusMode: false,
      immersiveTypewriterMode: false,
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
      setCustomThemeId: (customThemeId) =>
        set((state) => (state.customThemeId === customThemeId ? state : { customThemeId })),
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
      setMotionSmoothScrolling: (motionSmoothScrolling) =>
        set((state) =>
          state.motionSmoothScrolling === motionSmoothScrolling ? state : { motionSmoothScrolling },
        ),
      setMotionAnimatedCursor: (motionAnimatedCursor) =>
        set((state) =>
          state.motionAnimatedCursor === motionAnimatedCursor ? state : { motionAnimatedCursor },
        ),
      setMotionAnimatedPanels: (motionAnimatedPanels) =>
        set((state) =>
          state.motionAnimatedPanels === motionAnimatedPanels ? state : { motionAnimatedPanels },
        ),
      setImmersiveZenMode: (immersiveZenMode) =>
        set((state) =>
          state.immersiveZenMode === immersiveZenMode ? state : { immersiveZenMode },
        ),
      setImmersiveFocusMode: (immersiveFocusMode) =>
        set((state) =>
          state.immersiveFocusMode === immersiveFocusMode ? state : { immersiveFocusMode },
        ),
      setImmersiveTypewriterMode: (immersiveTypewriterMode) =>
        set((state) =>
          state.immersiveTypewriterMode === immersiveTypewriterMode
            ? state
            : { immersiveTypewriterMode },
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
      version: APP_STORE_VERSION,
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
      migrate: migrateAppStoreState,
      partialize: partializeAppStoreState,
    },
  ),
)
