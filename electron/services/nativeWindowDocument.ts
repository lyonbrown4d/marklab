import path from 'node:path'
import type { App, BrowserWindow } from 'electron'

import type { FsRootInfo } from '@electron/services/workspace/types'

type NativeDocumentWindow = Pick<
  BrowserWindow,
  'isDestroyed' | 'setDocumentEdited' | 'setRepresentedFilename'
>

type NativeRecentDocumentApp = Pick<App, 'addRecentDocument'>

const nativeRecentDocumentExtensions = new Set(['.md', '.markdown'])

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
  if (!recentPath) return
  addNativeRecentDocument(app, recentPath, state, platform)
}

export const applyAppRecentWorkspaceFile = (
  app: NativeRecentDocumentApp,
  root: FsRootInfo,
  absolutePath: string,
  state: NativeRecentDocumentState,
  platform: NodeJS.Platform = process.platform,
): void => {
  if (root.kind !== 'external') return
  addNativeRecentDocument(app, absolutePath, state, platform)
}

const addNativeRecentDocument = (
  app: NativeRecentDocumentApp,
  recentPath: string,
  state: NativeRecentDocumentState,
  platform: NodeJS.Platform,
): void => {
  if (platform !== 'darwin' && platform !== 'win32') return
  if (
    platform === 'win32' &&
    !nativeRecentDocumentExtensions.has(path.extname(recentPath).toLowerCase())
  ) {
    return
  }
  if (recentPath === state.path) return

  state.path = recentPath
  app.addRecentDocument(recentPath)
}
