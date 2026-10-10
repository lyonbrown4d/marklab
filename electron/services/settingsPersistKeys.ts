import { RENDERER_PERSIST_KEYS } from '@/types/persistenceKeys'
import type { RendererPersistKey } from '@electron/types'

export const rendererPersistKeys = new Set<RendererPersistKey>(Object.values(RENDERER_PERSIST_KEYS))

export const drawioStateKeys = new Set(['drawioEditorMode', 'drawioEmbedUrl'])

export const preferenceStateKeys = new Set([
  'autoSystemThemeSync',
  'aiCompletionCloudContextConsent',
  'aiCompletionEnabled',
  'aiCompletionLength',
  'aiCompletionNearbyContextEnabled',
  'aiCompletionProviderId',
  'aiCompletionTriggerMode',
  'documentCompletionEnabled',
  'desktopNotificationExportsEnabled',
  'desktopNotificationsBackgroundOnly',
  'desktopNotificationsEnabled',
  'desktopNotificationSyncEnabled',
  'desktopNotificationUpdatesEnabled',
  'aiDefaultProviderId',
  'customThemeId',
  'defaultFileView',
  'editorReadOnlyMode',
  'graphContentMode',
  'graphMiniMapEnabled',
  'graphMiniMapPosition',
  'graphMiniMapSize',
  'hideMarkdownDefaultAppPrompt',
  'immersiveFocusIntensity',
  'immersiveFocusMode',
  'immersiveFocusScope',
  'immersiveTypewriterMode',
  'immersiveZenMode',
  'locale',
  'markdownAssetImportStrategy',
  'motionAnimatedCursor',
  'motionAnimatedPanels',
  'motionSmoothScrolling',
  'rightSidebarCollapsed',
  'shortcutOverrides',
  'showEditorStatusBar',
  'sidebarCollapsed',
  'silentSave',
  'sourceCodeMiniMapEnabled',
  'terminalShellPath',
  'theme',
  'themeMode',
  'lightTheme',
  'darkTheme',
])

export const rendererSettingsStateKeys: Partial<Record<RendererPersistKey, Set<string>>> = {
  [RENDERER_PERSIST_KEYS.drawio]: drawioStateKeys,
  [RENDERER_PERSIST_KEYS.preferences]: preferenceStateKeys,
}

export const workspaceSessionStateKeys = new Set(['activeTabId', 'rootKind', 'rootPath', 'tabs'])

export const workspaceRecentProjectsStateKeys = new Set(['recentProjects'])
