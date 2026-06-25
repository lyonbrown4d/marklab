import { WorkspaceFileEntryKind } from '@electron/generated/knowledge-engine/knowledge/engine/v1/engine.js'
import type { WorkspaceFileEntry } from '@electron/generated/knowledge-engine/knowledge/engine/v1/engine.js'
import type { FsEntry } from '@electron/services/workspace/types.js'

export const workspaceFileEntryToFsEntry = (entry: WorkspaceFileEntry): FsEntry => ({
  kind: workspaceFileEntryKindToFsKind(entry.kind),
  name: entry.name,
  path: entry.path,
})

export const workspaceFileEntryKindToFsKind = (kind: WorkspaceFileEntryKind): FsEntry['kind'] => {
  if (kind === WorkspaceFileEntryKind.WORKSPACE_FILE_ENTRY_KIND_FOLDER) return 'folder'
  return 'file'
}
