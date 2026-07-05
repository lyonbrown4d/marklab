import type { BrowserWindow } from 'electron'

import type { FsRootInfo } from '@electron/services/workspace/types.js'

type NativeDocumentWindow = Pick<
  BrowserWindow,
  'isDestroyed' | 'setDocumentEdited' | 'setRepresentedFilename'
>

export const representedFilenameForRoot = (root: FsRootInfo): string => {
  if (root.kind === 'internal') return ''
  return root.path
}

export const applyWindowDocumentStatus = (
  window: NativeDocumentWindow,
  root: FsRootInfo,
  dirty: boolean,
): void => {
  if (window.isDestroyed()) return

  window.setRepresentedFilename(representedFilenameForRoot(root))
  window.setDocumentEdited(dirty)
}
