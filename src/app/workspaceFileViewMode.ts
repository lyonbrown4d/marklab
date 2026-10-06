import { getPreviewFileKind } from '@/logic/fileTypes'
import type { FileViewKind, ViewMode } from '@/store/appTypes'

export const resolveWorkspaceFileViewMode = (
  path: string,
  requestedMode: ViewMode,
): ViewMode | null => {
  const previewKind = getPreviewFileKind(path)
  const mode = previewKind === 'source' && requestedMode === 'wysiwyg' ? 'preview' : requestedMode
  if (previewKind && previewKind !== 'source') return mode === 'preview' ? mode : null
  if (previewKind === 'source') {
    return mode === 'preview' || mode === 'source' ? mode : null
  }
  return mode
}

export const fileViewForMode = (mode: ViewMode): FileViewKind => {
  if (mode === 'source') return 'source'
  if (mode === 'preview') return 'preview'
  return 'edit'
}
