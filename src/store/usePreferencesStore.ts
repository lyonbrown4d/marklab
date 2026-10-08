import { create } from 'zustand'
import { RENDERER_PERSIST_KEYS } from '@/types/persistenceKeys'
import { persist } from 'zustand/middleware'
import { getInitialLocale } from '@/i18n/utils'
import {
  normalizeShortcutList,
  type ShortcutActionId,
  type ShortcutBindings,
} from '@/logic/shortcuts'
import { isDarkThemeMode } from '@/logic/themes'
import {
  areStringArraysEqual,
  selectPreferencesPersistedState,
  type PreferencesPersistedState,
} from '@/store/preferencesPersist'
import { createElectronSettingsJsonStorage } from '@/store/persistStorage'
import {
  createAiCompletionPreferencesSlice,
  type AiCompletionPreferencesState,
} from '@/store/aiCompletionPreferences'
import { preferencesSidebarGuards } from '@/store/preferencesSidebarGuards'
import {
  createImmersivePreferencesSlice,
  type ImmersivePreferencesState,
} from '@/store/immersivePreferences'
import {
  createTerminalPreferencesSlice,
  type TerminalPreferencesState,
} from '@/store/terminalPreferences'
import type {
  AppLocale,
  DarkThemeMode,
  FileViewKind,
  LightThemeMode,
  MarkdownAssetImportStrategy,
  ThemeColorMode,
  ThemeMode,
  ThemeModePreference,
} from '@/store/appTypes'
import { createGraphPreferencesSlice, type GraphPreferencesState } from '@/store/graphPreferences'
import {
  createNotificationPreferencesSlice,
  type NotificationPreferencesState,
} from '@/store/notificationPreferences'

export type PreferencesState = AiCompletionPreferencesState &
  GraphPreferencesState &
  ImmersivePreferencesState &
  NotificationPreferencesState &
  TerminalPreferencesState & {
    theme: ThemeMode
    themeMode: ThemeModePreference
    lightTheme: LightThemeMode
    darkTheme: DarkThemeMode
    autoSystemThemeSync: boolean
    customThemeId: string | null
    aiDefaultProviderId: string | null
    locale: AppLocale
    sidebarCollapsed: boolean
    rightSidebarCollapsed: boolean
    silentSave: boolean
    showEditorStatusBar: boolean
    sourceCodeMiniMapEnabled: boolean
    defaultFileView: FileViewKind
    hideMarkdownDefaultAppPrompt: boolean
    markdownAssetImportStrategy: MarkdownAssetImportStrategy
    motionSmoothScrolling: boolean
    motionAnimatedCursor: boolean
    motionAnimatedPanels: boolean
    shortcutOverrides: ShortcutBindings
    setTheme: (theme: ThemeMode) => void
    setThemeMode: (mode: ThemeModePreference) => void
    syncSystemTheme: (mode: ThemeColorMode) => void
    setLightTheme: (theme: LightThemeMode) => void
    setDarkTheme: (theme: DarkThemeMode) => void
    setAutoSystemThemeSync: (enabled: boolean) => void
    setCustomThemeId: (themeId: string | null) => void
    setAiDefaultProviderId: (providerId: string | null) => void
    setLocale: (locale: AppLocale) => void
    setSilentSave: (silent: boolean) => void
    setShowEditorStatusBar: (show: boolean) => void
    setSourceCodeMiniMapEnabled: (enabled: boolean) => void
    setDefaultFileView: (view: FileViewKind) => void
    setHideMarkdownDefaultAppPrompt: (hidden: boolean) => void
    setMarkdownAssetImportStrategy: (strategy: MarkdownAssetImportStrategy) => void
    setMotionSmoothScrolling: (enabled: boolean) => void
    setMotionAnimatedCursor: (enabled: boolean) => void
    setMotionAnimatedPanels: (enabled: boolean) => void
    setShortcutOverride: (action: ShortcutActionId, bindings: string[] | null) => void
    resetShortcutOverrides: () => void
    toggleSidebar: () => void
    toggleRightSidebar: () => void
  }

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set, get, store) => ({
      theme: 'paper',
      themeMode: 'system',
      lightTheme: 'paper',
      darkTheme: 'ink',
      autoSystemThemeSync: true,
      customThemeId: null,
      aiDefaultProviderId: null,
      ...createAiCompletionPreferencesSlice(set, get, store),
      ...createGraphPreferencesSlice(set, get, store),
      ...createImmersivePreferencesSlice(set, get, store),
      ...createNotificationPreferencesSlice(set, get, store),
      ...createTerminalPreferencesSlice(set, get, store),
      locale: getInitialLocale(),
      sidebarCollapsed: true,
      rightSidebarCollapsed: true,
      silentSave: true,
      showEditorStatusBar: true,
      sourceCodeMiniMapEnabled: true,
      defaultFileView: 'edit',
      hideMarkdownDefaultAppPrompt: false,
      markdownAssetImportStrategy: 'copy-to-document-assets',
      motionSmoothScrolling: true,
      motionAnimatedCursor: true,
      motionAnimatedPanels: true,
      shortcutOverrides: {},
      setTheme: (theme) =>
        set((state) => {
          if (isDarkThemeMode(theme)) {
            return state.theme === theme && state.darkTheme === theme && state.themeMode === 'dark'
              ? state
              : { theme, themeMode: 'dark', darkTheme: theme }
          }
          return state.theme === theme && state.lightTheme === theme && state.themeMode === 'light'
            ? state
            : { theme, themeMode: 'light', lightTheme: theme }
        }),
      setThemeMode: (themeMode) =>
        set((state) => {
          if (themeMode === 'system') {
            return state.themeMode === 'system' ? state : { themeMode }
          }
          const theme = themeMode === 'light' ? state.lightTheme : state.darkTheme
          return state.themeMode === themeMode && state.theme === theme
            ? state
            : { themeMode, theme }
        }),
      syncSystemTheme: (mode) =>
        set((state) => {
          if (state.themeMode !== 'system') return state
          const theme = mode === 'light' ? state.lightTheme : state.darkTheme
          return state.theme === theme ? state : { theme }
        }),
      setLightTheme: (lightTheme) =>
        set((state) => {
          const theme =
            state.themeMode === 'light' ||
            (state.themeMode === 'system' && !isDarkThemeMode(state.theme))
              ? lightTheme
              : state.theme
          return state.lightTheme === lightTheme && state.theme === theme
            ? state
            : { lightTheme, theme }
        }),
      setDarkTheme: (darkTheme) =>
        set((state) => {
          const theme =
            state.themeMode === 'dark' ||
            (state.themeMode === 'system' && isDarkThemeMode(state.theme))
              ? darkTheme
              : state.theme
          return state.darkTheme === darkTheme && state.theme === theme
            ? state
            : { darkTheme, theme }
        }),
      setAutoSystemThemeSync: (autoSystemThemeSync) =>
        set((state) =>
          state.autoSystemThemeSync === autoSystemThemeSync ? state : { autoSystemThemeSync },
        ),
      setCustomThemeId: (customThemeId) =>
        set((state) => (state.customThemeId === customThemeId ? state : { customThemeId })),
      setAiDefaultProviderId: (aiDefaultProviderId) =>
        set((state) =>
          state.aiDefaultProviderId === aiDefaultProviderId ? state : { aiDefaultProviderId },
        ),
      setLocale: (locale) => set((state) => (state.locale === locale ? state : { locale })),
      setSilentSave: (silentSave) =>
        set((state) => (state.silentSave === silentSave ? state : { silentSave })),
      setShowEditorStatusBar: (showEditorStatusBar) =>
        set((state) =>
          state.showEditorStatusBar === showEditorStatusBar ? state : { showEditorStatusBar },
        ),
      setSourceCodeMiniMapEnabled: (sourceCodeMiniMapEnabled) =>
        set((state) =>
          state.sourceCodeMiniMapEnabled === sourceCodeMiniMapEnabled
            ? state
            : { sourceCodeMiniMapEnabled },
        ),
      setDefaultFileView: (defaultFileView) =>
        set((state) => (state.defaultFileView === defaultFileView ? state : { defaultFileView })),
      setHideMarkdownDefaultAppPrompt: (hideMarkdownDefaultAppPrompt) =>
        set((state) =>
          state.hideMarkdownDefaultAppPrompt === hideMarkdownDefaultAppPrompt
            ? state
            : { hideMarkdownDefaultAppPrompt },
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
      setShortcutOverride: (action, bindings) =>
        set((state) => {
          if (
            bindings === null &&
            !Object.prototype.hasOwnProperty.call(state.shortcutOverrides, action)
          ) {
            return state
          }

          const next = { ...state.shortcutOverrides }
          if (bindings === null) {
            delete next[action]
          } else {
            const normalized = normalizeShortcutList(bindings)
            const current = state.shortcutOverrides[action]
            if (current && areStringArraysEqual(current, normalized)) return state
            next[action] = normalized
          }
          return { shortcutOverrides: next }
        }),
      resetShortcutOverrides: () =>
        set((state) =>
          Object.keys(state.shortcutOverrides).length === 0 ? state : { shortcutOverrides: {} },
        ),
      toggleSidebar: () => {
        if (!preferencesSidebarGuards.left()) return
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }))
      },
      toggleRightSidebar: () => {
        if (!preferencesSidebarGuards.right()) return
        set((state) => ({ rightSidebarCollapsed: !state.rightSidebarCollapsed }))
      },
    }),
    {
      name: RENDERER_PERSIST_KEYS.preferences,
      storage: createElectronSettingsJsonStorage<PreferencesPersistedState>(
        RENDERER_PERSIST_KEYS.preferences,
      ),
      version: 2,
      partialize: selectPreferencesPersistedState,
    },
  ),
)
