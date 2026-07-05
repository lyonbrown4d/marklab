import type { App, BrowserWindow } from 'electron'

import type { FsRootInfo } from '@electron/services/workspace/types.js'

type NativeDocumentWindow = Pick<
  BrowserWindow,
  'isDestroyed' | 'setDocumentEdited' | 'setRepresentedFilename'
>

type NativeRecentDocumentApp = Pick<App, 'addRecentDocument'>

export type NativeRecentDocumentState = {
  path: string | null
}

export const representedFilenameForRoot = (root: FsRootInfo): string => {
  if (root.kind === 'internal') return ''
  return root.path
}

export const recentDocumentPathForRoot = (root: FsRootInfo): string | null => {
  if (root.kind === 'internal') return null
  return root.path
}

export const createNativeRecentDocumentState = (): NativeRecentDocumentState => ({
  path: null,
})

export const applyWindowDocumentStatus = (
  window: NativeDocumentWindow,
  root: FsRootInfo,
  dirty: boolean,
): void => {
  if (window.isDestroyed()) return

  window.setRepresentedFilename(representedFilenameForRoot(root))
  window.setDocumentEdited(dirty)
}

export const applyAppRecentDocument = (
  app: NativeRecentDocumentApp,
  root: FsRootInfo,
  state: NativeRecentDocumentState,
  platform: NodeJS.Platform = process.platform,
): void => {
  const recentPath = recentDocumentPathForRoot(root)
  if (!recentPath || recentPath === state.path) return

  state.path = recentPath
  if (platform === 'darwin' || platform === 'win32') {
    app.addRecentDocument(recentPath)
  }
}
