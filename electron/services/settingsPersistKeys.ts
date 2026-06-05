import type { RendererPersistKey } from '@electron/types.js'

export const rendererPersistKeys = new Set<RendererPersistKey>(['marko.app'])

export const settingsStateKeys = new Set([
  'customThemeId',
  'defaultFileView',
  'graphContentMode',
  'graphMiniMapEnabled',
  'immersiveFocusMode',
  'immersiveTypewriterMode',
  'immersiveZenMode',
  'locale',
  'markdownAssetImportStrategy',
  'motionAnimatedCursor',
  'motionAnimatedPanels',
  'motionSmoothScrolling',
  'shortcutOverrides',
  'showEditorStatusBar',
  'silentSave',
  'theme',
])

export const sessionStateKeys = new Set([
  'activeTabId',
  'rightSidebarCollapsed',
  'rootKind',
  'rootPath',
  'sidebarCollapsed',
  'tabs',
  'viewMode',
])

export const recentProjectsStateKeys = new Set(['recentProjects'])
